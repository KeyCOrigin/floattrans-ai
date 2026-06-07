// AudioPipeline.service.ts — 音频管道领域服务
// 职责：ASR → 归一化 → PartialSegmentManager → 防抖 → NMT 首发翻译 → 弹幕输出 → LLM 异步修正
// 双路径架构：NMT 负责低延迟首发，LLM 负责高质量异步修正
//
// PartialSegmentManager 解决 ASR partial 重复问题：
//   "I" → "I am" → "I am Chen" 被视为同一 utterance 的修订，
//   共享同一个 segmentId，不会产生多条重复弹幕。

import type { IASRService } from "./IASRService.port";
import type { INMTService } from "./INMTService.port";
import type { ICorrectionService } from "./ICorrectionService.port";
import type { ITranslationGate } from "./ITranslationGate.port";
import type { ASRResult } from "./ASRResult.value-object";
import type { Session } from "../../session/domain/Session.entity";
import type { PipelineOutputPort, DanmakuEntrySnapshot } from "./PipelineOutputPort.port";
import type { ISpeechTextNormalizer } from "./ISpeechTextNormalizer.port";
import type { IAdaptiveDebounceStrategy } from "./IAdaptiveDebounceStrategy.port";
import type { SpeechMetrics } from "./SpeechMetrics.value-object";
import type { CorrectionRequest } from "./CorrectionRequest.value-object";
import type { IPartialSegmentManager } from "./IPartialSegmentManager.port";
import type { SegmentState } from "./SegmentState.value-object";
import { TranslationError } from "../../../../../shared/errors/AppError";

/** 弹幕条目置信度 */
const PARTIAL_TRANSLATION_CONFIDENCE = 0.85;
/** 语速计算滑窗大小 */
const SPEECH_RATE_WINDOW = 3;
/** 弹幕池最大条目数 */
const MAX_DANMAKU_ENTRIES = 10;
/** 修正请求的历史上下文条数 */
const CORRECTION_CONTEXT_SIZE = 5;

export type PipelineCallback = (segment: {
  readonly segmentId: string;
  readonly english: string;
  readonly chinese: string;
  readonly confidence: number;
  readonly startTime: number;
  readonly endTime: number;
}) => void;

export type PartialCallback = (text: string, timestamp: number) => void;

export type ErrorCallback = (error: Error) => void;

export type PipelineSegment = {
  readonly segmentId: string;
  readonly english: string;
  readonly chinese: string;
  readonly confidence: number;
  readonly startTime: number;
  readonly endTime: number;
};

export class AudioPipeline {
  #session: Session | null = null;
  #output: PipelineOutputPort | null = null;

  /** 上次 NMT 翻译完成的文本（防重复翻译） */
  #lastTranslatedText = "";
  /** 当前累积的最新 partial 文本 */
  #currentPartialText = "";
  /** 翻译防抖定时器 */
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 防止并发翻译 */
  #isTranslating = false;
  /** 翻译链式重试上限（防止 finally 块中无限递归） */
  static readonly #MAX_TRANSLATION_RETRIES = 3;

  /** 语速滑窗 */
  #speechRateSamples: Array<{ time: number; length: number }> = [];

  /** 弹幕池 ID 队列（FIFO），用于精确 evict */
  #danmakuIds: string[] = [];

  /** 当前活跃的 segment（由 PartialSegmentManager 管理） */
  #activeSegment: SegmentState | null = null;

  constructor(
    private readonly asrService: IASRService,
    private readonly nmtService: INMTService,
    private readonly correctionService: ICorrectionService,
    private readonly normalizer: ISpeechTextNormalizer,
    private readonly debounceEngine: IAdaptiveDebounceStrategy,
    private readonly segmentManager: IPartialSegmentManager,
    private readonly translationGate: ITranslationGate,
  ) {}

  async start(session: Session, output: PipelineOutputPort): Promise<void> {
    this.#session = session;
    this.#output = output;
    this.#danmakuIds = [];
    this.#lastTranslatedText = "";
    this.#currentPartialText = "";
    this.#speechRateSamples = [];
    this.#activeSegment = null;
    this.segmentManager.reset();
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
    onSegment: PipelineCallback,
    onPartial: PartialCallback,
    onError: ErrorCallback,
  ): void {
    // ── Partial 路径 ──
    this.asrService.onPartialResult((rawText) => {
      const norm = this.normalizer.normalizeForTranslation(rawText);
      const state = this.segmentManager.acceptPartial(norm.normalized);
      this.#activeSegment = state;

      // 实时显示 partial 文本
      onPartial(state.text, Date.now());

      // 新 utterance → 推入弹幕条目（draft 状态，等待 NMT 填充中文）
      if (state.isNewUtterance) {
        this.#output?.sendDanmakuPush({
          id: state.segmentId,
          english: state.text,
          chinese: "",
          status: "draft",
          confidence: PARTIAL_TRANSLATION_CONFIDENCE,
        });
        this.#danmakuIds.push(state.segmentId);
        // 弹幕池溢出 → evict 最旧条目（FIFO）
        while (this.#danmakuIds.length > MAX_DANMAKU_ENTRIES) {
          const evictId = this.#danmakuIds.shift();
          if (evictId) this.#output?.sendDanmakuEvict(evictId);
        }
      }

      this.#scheduleTranslation(state, onError);
      this.#recordSpeechSample(rawText.length);
    });

    // ── Final 路径 ──
    this.asrService.onFinalResult(async (result: ASRResult) => {
      try {
        if (this.#debounceTimer) {
          clearTimeout(this.#debounceTimer);
          this.#debounceTimer = null;
        }
        const norm = this.normalizer.normalizeForTranslation(result.text);
        const state = this.segmentManager.acceptFinal(norm.normalized);
        this.#activeSegment = state;

        if (!state.text || state.text === this.#lastTranslatedText) return;

        // 若无 prior partial（如 ASR 直接给 final），先 push 弹幕
        if (this.#danmakuIds.length === 0) {
          this.#output?.sendDanmakuPush({
            id: state.segmentId,
            english: state.text,
            chinese: "",
            status: "draft",
            confidence: PARTIAL_TRANSLATION_CONFIDENCE,
          });
          this.#danmakuIds.push(state.segmentId);
        }

        // NMT 首发翻译
        const chinese = await this.#translateWithNMT(state.text);

        // 回写 segment 到 Session 聚合根，供后续 LLM 修正获取历史上下文
        this.#session?.addSegment({
          id: state.segmentId,
          startTime: result.startTime,
          endTime: result.endTime,
          english: state.text,
          chinese,
          status: "final",
          confidence: result.confidence,
        });

        // ── 异步修正路径（fire-and-forget，不阻塞）──
        this.#scheduleCorrection(state.segmentId, state.text, chinese).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          onError(new TranslationError(`Correction failed: ${message}`));
        });

        this.#lastTranslatedText = state.text;

        // 更新弹幕为最终状态
        this.#output?.sendDanmakuUpdate(state.segmentId, chinese, true);

        onSegment({
          segmentId: state.segmentId,
          english: state.text,
          chinese,
          confidence: result.confidence,
          startTime: result.startTime,
          endTime: result.endTime,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(new TranslationError(message));
      }
    });

    this.asrService.onError((err) => {
      this.#output?.sendStatus("asr_error", err.message);
      onError(err);
    });
  }

  /** 自适应防抖 + NMT 翻译调度（partial 路径：经 gate 判断后可能跳过 NMT） */
  #scheduleTranslation(
    state: SegmentState,
    onError: ErrorCallback,
  ): void {
    this.#currentPartialText = state.text;
    if (!state.isNewUtterance && state.text === this.#lastTranslatedText) return;

    // 门控检查：非 final 阶段不触发 NMT，避免逐词翻译闪烁
    const metrics = this.#computeSpeechMetrics(state.text);
    if (!this.translationGate.shouldTranslate(state, metrics)) return;

    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);

    if (this.#isTranslating) {
      this.#debounceTimer = setTimeout(() => {
        this.#debounceTimer = null;
        this.#executeNMTTranslation(state.segmentId, this.#currentPartialText, onError);
      }, 300);
      return;
    }

    const decision = this.debounceEngine.decide(state.text, this.#lastTranslatedText, metrics);

    if (!decision.shouldTranslate) return;

    if (decision.debounceMs === 0) {
      this.#executeNMTTranslation(state.segmentId, state.text, onError);
      return;
    }

    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      this.#executeNMTTranslation(state.segmentId, this.#currentPartialText, onError);
    }, decision.debounceMs);
  }

  /**
   * NMT 首发翻译 + 弹幕更新（使用 PartialSegmentManager 分配的稳定 segmentId）
   *
   * 架构关键：partial 翻译只更新弹幕（sendDanmakuUpdate），不输出完整 segment。
   * onSegment 仅在 ASR final 时由 onFinalResult 直接调用，避免每次 partial
   * 翻译都产生一条完整的翻译记录导致 UI 重复。
   */
  async #executeNMTTranslation(
    segmentId: string,
    text: string,
    onError: ErrorCallback,
    /** 链式重试深度（内部使用，防止 finally 块中无限递归） */
    retryDepth: number = 0,
  ): Promise<void> {
    if (!text || text === this.#lastTranslatedText || this.#isTranslating) return;

    this.#isTranslating = true;

    try {
      const chinese = await this.#translateWithNMT(text);
      const normalizedChinese = this.normalizer.normalizeTranslationOutput(chinese);

      // 仅当 segmentId 仍是当前活跃段时才更新弹幕和翻译状态
      // （防止过期翻译覆盖新内容）
      if (this.#activeSegment?.segmentId === segmentId) {
        this.#output?.sendDanmakuUpdate(segmentId, normalizedChinese, true);
        this.#lastTranslatedText = text;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onError(new TranslationError(message));
    } finally {
      this.#isTranslating = false;
      // 检视是否有新的 partial 在等待 → 链式触发翻译（有深度上限）
      if (
        retryDepth < AudioPipeline.#MAX_TRANSLATION_RETRIES &&
        this.#debounceTimer === null &&
        this.#currentPartialText !== text
      ) {
        const activeId = this.#activeSegment?.segmentId;
        if (activeId) {
          await this.#executeNMTTranslation(
            activeId,
            this.#currentPartialText,
            onError,
            retryDepth + 1,
          );
        }
      }
    }
  }

  /** 调用 NMT 服务翻译 */
  async #translateWithNMT(text: string): Promise<string> {
    this.#output?.sendStatus("translating");
    return this.nmtService.translate(text);
  }

  /**
   * 异步修正路径（fire-and-forget）：
   * 等 NMT 首发翻译完成后，用 LLM 基于历史上下文修正译文（包括当前句和既往句）。
   */
  async #scheduleCorrection(
    currentSegmentId: string,
    currentText: string,
    currentTranslation: string,
  ): Promise<void> {
    const session = this.#session;
    if (!session) return;

    const history = session.getContext(CORRECTION_CONTEXT_SIZE);

    const request: CorrectionRequest = {
      currentText,
      currentTranslation,
      currentSegmentId,
      history,
    };

    const suggestions = await this.correctionService.review(request);

    for (const s of suggestions) {
      session.applyCorrection({
        segmentId: s.targetSegmentId,
        oldEnglish: s.oldEnglish,
        newEnglish: s.newEnglish,
        oldChinese: s.oldChinese,
        newChinese: s.newChinese,
        reason: s.reason,
      });

      this.#output?.sendDanmakuCorrect(
        s.targetSegmentId,
        s.oldChinese,
        s.newChinese,
      );
    }
  }

  /** 计算实时语速指标 */
  #computeSpeechMetrics(text: string): SpeechMetrics {
    const now = Date.now();
    this.#recordSpeechSample(text.length);

    const recent = this.#speechRateSamples.slice(-SPEECH_RATE_WINDOW);
    let charsPerSecond = 0;
    if (recent.length >= 2) {
      const first = recent[0]!;
      const last = recent[recent.length - 1]!;
      const durationMs = last.time - first.time;
      const totalChars = last.length - first.length;
      if (durationMs > 0) {
        charsPerSecond = (totalChars / durationMs) * 1000;
      }
    }

    const msSinceLastPartial =
      recent.length >= 2
        ? now - recent[recent.length - 2]!.time
        : 500;

    const punctuationEnds = /[.!?。！？\n]$/.test(text);

    return {
      charsPerSecond: Math.max(0, Math.min(charsPerSecond, 50)),
      msSinceLastPartial,
      punctuationEnds,
      segmentCount: this.#danmakuIds.length,
    };
  }

  #recordSpeechSample(currentLength: number): void {
    this.#speechRateSamples.push({ time: Date.now(), length: currentLength });
    if (this.#speechRateSamples.length > 50) {
      this.#speechRateSamples.shift();
    }
  }

  pushAudio(chunk: ArrayBuffer): void {
    this.asrService.pushAudio(chunk);
  }

  async stop(): Promise<void> {
    this.#session = null;
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    this.#lastTranslatedText = "";
    this.#currentPartialText = "";
    this.#danmakuIds = [];
    this.#speechRateSamples = [];
    this.#activeSegment = null;
    await this.asrService.stopRecognition();
  }
}

