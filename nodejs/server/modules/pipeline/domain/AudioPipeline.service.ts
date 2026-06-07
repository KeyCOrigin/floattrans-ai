// AudioPipeline.service.ts — 音频管道领域服务（Phase 1: LiveLine 稳定身份）
//
// 职责：ASR → LiveDocument → NMT 翻译 → LLM 修正 → Markdown 推送
//
// Phase 1 核心变化：
//   - TranscriptDocument → LiveDocument（稳定 lineId）
//   - #lineStates keyed by lineId (string) 替代 lineNumber (number)
//   - appendOrRefine() 返回 { lineId, sourceVersion } 供 NMT 陈旧守卫
//   - applyNmtResult(lineId, chinese, sourceVersion) 内置陈旧检测
//   - LLM 修正路径简化：移除 rebuildFromCorrected / parseFullDocument
//     （Phase 2 通过 MergeGroup 安全合并）
//   - NmtTranslateContext.lineId 替代 lineNumber

import type { IASRService } from "./IASRService.port";
import type { INMTService } from "./INMTService.port";
import type { ICorrectionService } from "./ICorrectionService.port";
import type { ASRResult } from "./ASRResult.value-object";
import type { Session } from "../../session/domain/Session.entity";
import type { PipelineOutputPort } from "./PipelineOutputPort.port";
import { LiveDocument } from "./LiveDocument.entity";
import { TranscriptDiffEngine } from "./TranscriptDiffEngine.service";
import { MergeGroupManager } from "./MergeGroupManager.service";
import type { ITranscriptRepository } from "./ITranscriptRepository.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

/** LLM 修正触发间隔（句数） */
const CORRECTION_INTERVAL_SENTENCES = 3;
/** LLM 修正最小时间间隔（防止频繁触发导致文档抖动） */
const CORRECTION_MIN_INTERVAL_MS = 8000;

/** 逐行 NMT 翻译触发状态（AudioPipeline 内部运行时状态） */
interface LineTranslationState {
  lineId: string;
  version: number;
  lastTranslatedText: string;
  lastTranslatedAt: number;
}

export class AudioPipeline {
  #session: Session | null = null;
  #output: PipelineOutputPort | null = null;
  #doc: LiveDocument | null = null;
  #isTranslating = false;

  /** 逐行 NMT 触发状态：Key=lineId, Value=触发决策所需上下文 */
  #lineStates = new Map<string, LineTranslationState>();
  /** 上次 LLM 修正触发时间（防止频繁触发） */
  #lastLLMCorrectionAt = 0;

  constructor(
    private readonly asrService: IASRService,
    private readonly nmtService: INMTService,
    private readonly correctionService: ICorrectionService,
    private readonly repository: ITranscriptRepository,
    private readonly mergeGroupManager: MergeGroupManager,
    private readonly diffEngine: TranscriptDiffEngine = new TranscriptDiffEngine(),
  ) {}

  async start(session: Session, output: PipelineOutputPort): Promise<void> {
    this.#session = session;
    this.#output = output;
    this.#doc = LiveDocument.create(session.id);
    this.#isTranslating = false;
    this.#lineStates.clear();
    this.#lastLLMCorrectionAt = 0;
    this.mergeGroupManager.reset();

    output.sendStatus("asr_connecting");
    this.asrService.onReady(() => {
      output.sendStatus("asr_connected");
    });
    await this.asrService.startRecognition({
      language: "en-US",
      sampleRate: session.audioFormat.sampleRate,
    });
  }

  setCallbacks(
    _onSegment: () => void,
    _onPartial: () => void,
    onError: (error: Error) => void,
  ): void {
    // ── Partial 路径：更新实时英文 ──
    this.asrService.onPartialResult((result: ASRResult) => {
      const text = result.text;
      if (!text?.trim()) return;
      this.#doc?.updatePartialEnglish(text);
      this.#output?.sendPartial(text);
    });

    // ── Final 路径（由 ASR 层标点检测或 ls:true 触发）──
    this.asrService.onFinalResult(async (result: ASRResult) => {
      try {
        const text = result.text?.trim();
        if (!text || !this.#doc) return;
        await this.#processFinalText(result, onError);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[Pipeline] onFinal exception: ${message}\n`);
        onError(new TranslationError(message));
      }
    });

    this.asrService.onError((err) => {
      this.#output?.sendStatus("asr_error", err.message);
      onError(err);
    });
  }

  /**
   * 处理 final 文本：锁定行 → 异步 NMT 翻译（Phase 1: lineId 稳定身份 + 陈旧守卫）。
   *
   * 关键变化（Phase 1）：
   *   1. appendOrRefine() 返回 { lineId, sourceVersion }
   *   2. lineId 作为 #lineStates key 和 NmtTranslateContext.lineId
   *   3. sourceVersion 用于 NMT 回调陈旧守卫
   *   4. fire-and-forget（不阻塞管道）
   */
  async #processFinalText(result: ASRResult, onError: (error: Error) => void): Promise<void> {
    const doc = this.#doc;
    const output = this.#output;
    if (!doc || !output) return;

    const cleanText = result.text.trim();
    if (!cleanText) return;

    const appendResult = doc.appendOrRefine(cleanText);
    if (!appendResult) return;

    const { lineId, sourceVersion } = appendResult;

    process.stderr.write(
      `[Pipeline] final ${lineId.slice(0, 8)}: "${cleanText.slice(0, 80)}"\n`,
    );

    // ── Phase 2: 检查此行是否属于某合并组 → 标记脏 → 丢弃过期组 ──
    const affectedGroups = this.mergeGroupManager.getGroupsForLine(lineId);
    if (affectedGroups.length > 0) {
      this.mergeGroupManager.markDirtyByLine(lineId);
      // 丢弃所有脏组，恢复被隐藏的行
      const stale = this.mergeGroupManager.getStaleGroups();
      for (const g of stale) {
        this.mergeGroupManager.discardGroup(g.id, doc);
        process.stderr.write(
          `[Pipeline] merge group ${g.id} discarded (stale), ` +
          `${g.lineIds.length} lines restored\n`,
        );
      }
    }

    // 先推送不含中文的 markdown（前端立即显示"翻译中..."）
    output.sendContent(doc.toMarkdown(), doc.version);

    // 逐行 NMT 触发状态初始化
    let state = this.#lineStates.get(lineId);
    if (!state) {
      state = { lineId, version: 0, lastTranslatedText: "", lastTranslatedAt: 0 };
      this.#lineStates.set(lineId, state);
    }
    state.version++;

    // 判定是否发送 NMT
    // 只有文本以句尾标点结尾（。.!?）或 ASR 分段信号（segmentBreak）才视为完整句。
    const endsWithEndPunct = /[.!?。]$/.test(cleanText);
    const hasSegmentBreak = result.hasSegmentBreak === true;
    const isComplete = endsWithEndPunct || hasSegmentBreak;
    if (!this.#shouldSendNmt(state, cleanText, isComplete)) {
      return;
    }

    // 更新状态并发起 NMT 翻译
    state.lastTranslatedText = cleanText;
    state.lastTranslatedAt = Date.now();
    const currentVersion = state.version;
    const sentText = cleanText;
    const priority: "normal" | "high" = isComplete ? "high" : "normal";

    this.nmtService.translate(sentText, {
      lineId,
      version: sourceVersion,
      priority,
    })
      .then((chinese) => {
        if (!this.#doc || !this.#output) return;

        // 陈旧守卫：若该行 sourceVersion 已变化，丢弃本次结果
        const ok = this.#doc.applyNmtResult(lineId, chinese, sourceVersion);
        if (!ok) {
          const line = this.#doc.getLine(lineId);
          process.stderr.write(
            `[Pipeline] stale NMT ${lineId.slice(0, 8)} v${sourceVersion} ignored ` +
            `(current sourceVersion=${line?.sourceVersion ?? "?"})\n`,
          );
          return;
        }

        process.stderr.write(
          `[Pipeline] NMT ${lineId.slice(0, 8)}: "${chinese.slice(0, 80)}"\n`,
        );

        // 持久化到 .md 文件
        this.repository.save(this.#doc);
        process.stderr.write(
          `[Pipeline] saved to .md (${this.#doc.translatedCount} lines)\n`,
        );

        // 推送更新后的 Markdown（中文已填充）
        this.#output.sendContent(this.#doc.toMarkdown(), this.#doc.version);

        // 每 N 句触发 LLM 修正
        if (this.#doc.translatedCount % CORRECTION_INTERVAL_SENTENCES === 0) {
          this.#triggerLLMCorrection(onError);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[Pipeline] ERROR ${lineId.slice(0, 8)}: ${message}\n`,
        );
        onError(new TranslationError(message));
      });
  }

  /**
   * NMT 触发决策（领域逻辑）。
   *
   * 规则优先级：
   *   1. 文本完全未变 + < 900ms → 跳过
   *   2. 标点/分段触达 → 始终发送，优先级 high
   *   3. 首次翻译 → 发送
   *   4. 距上次 ≥ 900ms → 超时兜底发送
   *   5. 字符增量 ≥ 16 → 发送
   *   6. 词数增量 ≥ 4 → 发送
   *   7. 以上皆否 → 跳过（由 NmtScheduler 队列合并处理）
   *
   * @returns true=发送 NMT，false=跳过本次增量
   */
  #shouldSendNmt(state: LineTranslationState, text: string, isPunctOrSegment: boolean): boolean {
    const now = Date.now();
    const trimmed = text.trim();

    // 文本完全未变且在 900ms 内 → 跳过
    if (trimmed === state.lastTranslatedText && now - state.lastTranslatedAt < 900) {
      return false;
    }

    // 标点或分段 → 始终发送
    if (isPunctOrSegment) return true;

    // 首次翻译该行 → 发送
    if (!state.lastTranslatedText) return true;

    // 距上次翻译 ≥ 900ms → 超时兜底
    if (now - state.lastTranslatedAt >= 900) return true;

    // 字符增量显著（≥ 16）→ 发送
    const addedChars = trimmed.length - state.lastTranslatedText.length;
    if (addedChars >= 16) return true;

    // 词数增量显著（≥ 4）→ 发送
    const lastWordCount = state.lastTranslatedText.split(/\s+/).filter((w) => w.length > 0).length;
    const newWordCount = trimmed.split(/\s+/).filter((w) => w.length > 0).length;
    if (newWordCount - lastWordCount >= 4) return true;

    // 增量不够 → 跳过，依赖队列合并处理后续增量
    return false;
  }

  /**
   * LLM 全文修正（fire-and-forget，不阻塞管道）。
   * 读取当前文档可见行 → 发给 LLM → LLM 返回含 HTML 注释的 markdown →
   * diff 变更 + 检测合并 → 更新内部状态 → 推送原始 LLM 输出到前端 → 存盘。
   *
   * v6 变化：
   *   - LLM 输入使用 toVisibleMarkdown()（干净无注释）
   *   - LLM 输出直接推送前端 + 存盘（HTML 注释由前端 react-markdown 天然隐藏）
   *   - 移除后端生成隐藏注释的逻辑（信任 LLM 输出）
   */
  async #triggerLLMCorrection(onError: (err: Error) => void): Promise<void> {
    const doc = this.#doc;
    const output = this.#output;
    if (!doc || !output) return;

    // 时间守卫：距上次修正不足 8 秒 → 跳过
    const now = Date.now();
    if (now - this.#lastLLMCorrectionAt < CORRECTION_MIN_INTERVAL_MS) {
      return;
    }
    this.#lastLLMCorrectionAt = now;

    const markdown = doc.toVisibleMarkdown();
    if (!markdown) return;

    try {
      const correctedText = await this.correctionService.reviewFullDocument(markdown);
      if (!correctedText || correctedText === markdown) return;

      const parsedLines = this.diffEngine.parse(correctedText);

      // ── 1. LLM 中文修正 diff（先 diff，因为 merge 后会隐藏行导致索引错位）──
      const diffs = this.diffEngine.diff(doc.lines, parsedLines);
      if (diffs.length > 0) {
        doc.applyRefineResult(diffs);
      }

      // ── 2. 检测 LLM 是否合并了行（parsedLines 少于 doc.lines）──
      const merges = this.diffEngine.detectMerges(doc.lines, parsedLines);
      for (const m of merges) {
        const allLineIds = [m.representativeLineId, ...m.mergedLineIds];
        const repLine = doc.getLine(m.representativeLineId);
        const repText = repLine?.english ?? "";
        const group = this.mergeGroupManager.create(allLineIds, m.representativeLineId, repText);

        for (const lid of m.mergedLineIds) {
          doc.hideLine(lid, group.id);
        }

        process.stderr.write(
          `[Pipeline] merge group ${group.id}: ${m.mergedLineIds.length} lines hidden, ` +
          `rep ${m.representativeLineId.slice(0, 8)}\n`,
        );
      }

      // 有变更 → 存盘（LLM 原始输出）+ 推送前端
      if (diffs.length > 0 || merges.length > 0) {
        this.repository.saveContent(doc.id, correctedText);
        output.sendContent(correctedText, doc.version);

        process.stderr.write(
          `[Pipeline] LLM: ${diffs.length} corrections, ${merges.length} merges ` +
          `(visible lines: ${doc.lines.length})\n`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onError(new TranslationError(`LLM correction failed: ${message}`));
    }
  }

  pushAudio(chunk: ArrayBuffer): void {
    this.asrService.pushAudio(chunk);
  }

  async stop(): Promise<void> {
    this.#session = null;
    this.#doc = null;
    this.#isTranslating = false;
    await this.asrService.stopRecognition();
  }
}
