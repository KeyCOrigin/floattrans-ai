// AudioPipeline.service.ts — 音频管道领域服务（v5: Markdown 文档流）
// 职责：ASR → TranscriptDocument → NMT 翻译 → LLM 每3句修正 → Markdown 推送
//
// 核心变化：
//   - 前端渲染 Markdown（不再推送结构化 TranscriptSnapshot）
//   - 后端 sendContent(doc.toMarkdown(), doc.version) 替换 sendSnapshot
//   - LLM 通读全文做全量修正（每3句触发）

import type { IASRService } from "./IASRService.port";
import type { INMTService } from "./INMTService.port";
import type { ICorrectionService } from "./ICorrectionService.port";
import type { ASRResult } from "./ASRResult.value-object";
import type { Session } from "../../session/domain/Session.entity";
import type { PipelineOutputPort } from "./PipelineOutputPort.port";
import { TranscriptDocument } from "./TranscriptDocument.entity";
import { TranscriptDiffEngine } from "./TranscriptDiffEngine.service";
import type { ITranscriptRepository } from "./ITranscriptRepository.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

/** LLM 修正触发间隔（句数） */
const CORRECTION_INTERVAL_SENTENCES = 3;

export class AudioPipeline {
  #session: Session | null = null;
  #output: PipelineOutputPort | null = null;
  #doc: TranscriptDocument | null = null;
  #isTranslating = false;

  constructor(
    private readonly asrService: IASRService,
    private readonly nmtService: INMTService,
    private readonly correctionService: ICorrectionService,
    private readonly repository: ITranscriptRepository,
    private readonly diffEngine: TranscriptDiffEngine = new TranscriptDiffEngine(),
  ) {}

  async start(session: Session, output: PipelineOutputPort): Promise<void> {
    this.#session = session;
    this.#output = output;
    this.#doc = TranscriptDocument.create(session.id);
    this.#isTranslating = false;

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
        await this.#processFinalText(text, onError);
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
   * 处理 final 文本：锁定行 → 异步 NMT 翻译（v6: fire-and-forget 消阻塞）。
   *
   * 关键变化：
   *   1. appendFinalEnglish 后立即推送 markdown（中文显示"翻译中..."）
   *   2. NMT 翻译异步进行，不再 await 阻塞管道
   *   3. NMT 完成后更新文档并再次推送（前端无感刷新）
   *   4. 每 3 句触发 LLM 修正（仍在 NMT 回调中，不阻塞）
   *
   * 旧代码的问题（v5）：
   *   - await this.nmtService.translate() 同步阻塞整个 ASR→NMT 流
   *   - ASR 出句速度 >> NMT 翻译速度 → 累积 backlog
   *   - 到 50 句时累积延迟几十秒，表现为"强延迟"
   */
  async #processFinalText(text: string, onError: (error: Error) => void): Promise<void> {
    const doc = this.#doc;
    const output = this.#output;
    if (!doc || !output) return;

    const cleanText = text.trim();
    if (!cleanText) return;

    const lineNumber = doc.appendFinalEnglish(cleanText);
    if (lineNumber < 0) return;

    process.stderr.write(`[Pipeline] final #${lineNumber}: "${cleanText.slice(0, 80)}"\n`);

    // v6: 先推送不含中文的 markdown（前端立即显示"翻译中..."）
    output.sendContent(doc.toMarkdown(), doc.version);

    // v6: fire-and-forget NMT，不再阻塞管道
    this.nmtService.translate(cleanText)
      .then((chinese) => {
        // 管道可能已停止（会话结束）——安全检查
        if (!this.#doc || !this.#output) return;

        process.stderr.write(`[Pipeline] NMT #${lineNumber}: "${chinese.slice(0, 80)}"\n`);
        this.#doc.setChinese(lineNumber, chinese);

        // 持久化到 .md 文件
        this.repository.save(this.#doc);
        process.stderr.write(`[Pipeline] saved to .md (${this.#doc.translatedCount} lines)\n`);

        // 推送更新后的 Markdown（中文已填充）
        this.#output.sendContent(this.#doc.toMarkdown(), this.#doc.version);

        // 每 N 句触发 LLM 修正
        if (this.#doc.translatedCount % CORRECTION_INTERVAL_SENTENCES === 0) {
          this.#triggerLLMCorrection(onError);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[Pipeline] ERROR #${lineNumber}: ${message}\n`);
        onError(new TranslationError(message));
      });
  }

  /**
   * LLM 全文修正（fire-and-forget，不阻塞管道）。
   * 读取当前文档全文 → 发给 LLM → diff 变更 → 应用修正 → 存盘 → 推送。
   */
  async #triggerLLMCorrection(onError: (err: Error) => void): Promise<void> {
    const doc = this.#doc;
    const output = this.#output;
    if (!doc || !output) return;

    const markdown = doc.toMarkdown();
    if (!markdown) return;

    try {
      const correctedText = await this.correctionService.reviewFullDocument(markdown);
      if (!correctedText || correctedText === markdown) return;

      const correctedLines = this.diffEngine.parse(correctedText);
      const diffs = this.diffEngine.diff(doc.lines, correctedLines);

      if (diffs.length > 0) {
        doc.applyLLMCorrection(diffs);
        this.repository.save(doc);
        output.sendContent(doc.toMarkdown(), doc.version);
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
