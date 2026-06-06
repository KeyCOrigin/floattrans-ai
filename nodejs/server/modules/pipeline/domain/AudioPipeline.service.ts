// AudioPipeline.service.ts — 音频管道领域服务
// 职责：接收音频帧 → 调 ASR → 调 LLM → 生成字幕片段与修正
// 不持有业务状态（状态在 Session 中），仅持有会话引用用于上下文查询
// prompt 构建职责全部委托给 ITranslationService，管道只传原始文本

import type { IASRService } from "./IASRService.port";
import type { ITranslationService } from "./ITranslationService.port";
import type { ASRResult } from "./ASRResult.value-object";
import type { Session } from "../../session/domain/Session.entity";
import type { PipelineOutputPort } from "./PipelineOutputPort.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

/** 翻译防抖延迟（ms）：说话停顿后等待此时间再触发翻译 */
const TRANSLATION_DEBOUNCE_MS = 1200;
/** 增量翻译阈值（字符数）：文本新增超过此长度立即翻译 */
const TRANSLATION_CHAR_THRESHOLD = 50;
/** 单次翻译超时（ms）：超过此时间视为翻译失败 */
const TRANSLATION_TIMEOUT_MS = 15000;
/** 部分结果翻译时使用的默认置信度 */
const PARTIAL_TRANSLATION_CONFIDENCE = 0.85;
/** 孤立标点：这些字符不触发翻译 */
const IGNORED_PUNCTUATION = new Set([".", "。"]);

export type PipelineCallback = (segment: {
  readonly segmentId: string;
  readonly english: string;
  readonly chinese: string;
  readonly confidence: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly corrections: ReadonlyArray<{
    readonly segmentId: string;
    readonly oldEnglish: string;
    readonly newEnglish: string;
    readonly oldChinese: string;
    readonly newChinese: string;
    readonly reason: string;
  }>;
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
  readonly corrections: ReadonlyArray<{
    readonly segmentId: string;
    readonly oldEnglish: string;
    readonly newEnglish: string;
    readonly oldChinese: string;
    readonly newChinese: string;
    readonly reason: string;
  }>;
};

export class AudioPipeline {
  #segmentCounter = 0;
  #session: Session | null = null;
  #output: PipelineOutputPort | null = null;

  /** 部分翻译节流状态：记录上次翻译的文本，避免重复翻译 */
  #lastTranslatedText = "";
  /** 当前累积的部分文本（ASR 每次 onPartial 携带完整累计文本） */
  #currentPartialText = "";
  /** 翻译防抖定时器：说话停顿 1.2s 后触发翻译 */
  #translationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 防止并发翻译 */
  #isTranslating = false;

  constructor(
    private readonly asrService: IASRService,
    private readonly translationService: ITranslationService,
  ) {}

  async start(session: Session, output: PipelineOutputPort): Promise<void> {
    this.#session = session;
    this.#output = output;
    this.#segmentCounter = 0;
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
    this.asrService.onPartialResult((text) => {
      onPartial(text, Date.now());
      this.#schedulePartialTranslation(text, onSegment, onError);
    });

    this.asrService.onFinalResult(async (result: ASRResult) => {
      try {
        if (this.#translationDebounceTimer) {
          clearTimeout(this.#translationDebounceTimer);
          this.#translationDebounceTimer = null;
        }
        const text = result.text;
        if (text && !IGNORED_PUNCTUATION.has(text) && text !== this.#lastTranslatedText) {
          const segment = await this.#processFinalResult({ ...result, text });
          if (segment) {
            this.#lastTranslatedText = text;
            onSegment(segment);
          }
        }
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

  /**
   * 节流翻译调度：
   * - 正在翻译时一律延迟（避免并发覆盖）
   * - 文本增长 ≥ 阈值时立即翻译
   * - 否则启动防抖定时器（说话停顿后翻译）
   */
  #schedulePartialTranslation(
    text: string,
    onSegment: PipelineCallback,
    onError: ErrorCallback,
  ): void {
    this.#currentPartialText = text;

    if (this.#translationDebounceTimer) {
      clearTimeout(this.#translationDebounceTimer);
    }

    // 正在翻译中 → 始终设置定时器等待当前翻译完成
    if (this.#isTranslating) {
      this.#translationDebounceTimer = setTimeout(() => {
        this.#translationDebounceTimer = null;
        this.#executePartialTranslation(this.#currentPartialText, onSegment, onError);
      }, TRANSLATION_DEBOUNCE_MS);
      return;
    }

    const newChars = text.length - this.#lastTranslatedText.length;

    if (newChars >= TRANSLATION_CHAR_THRESHOLD) {
      this.#executePartialTranslation(text, onSegment, onError);
      return;
    }

    this.#translationDebounceTimer = setTimeout(() => {
      this.#translationDebounceTimer = null;
      this.#executePartialTranslation(this.#currentPartialText, onSegment, onError);
    }, TRANSLATION_DEBOUNCE_MS);
  }

  async #executePartialTranslation(
    text: string,
    onSegment: PipelineCallback,
    onError: ErrorCallback,
  ): Promise<void> {
    if (!text || text === this.#lastTranslatedText || this.#isTranslating) return;

    this.#isTranslating = true;
    try {
      const segment = await this.#translateWithTimeout(text);
      if (segment) {
        this.#lastTranslatedText = text;
        onSegment(segment);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onError(new TranslationError(message));
    } finally {
      this.#isTranslating = false;
    }
  }

  /** 带超时保护的翻译调用 */
  async #translateWithTimeout(text: string): Promise<PipelineSegment> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new TranslationError(`Translation timed out after ${TRANSLATION_TIMEOUT_MS}ms`)),
        TRANSLATION_TIMEOUT_MS,
      );
    });

    return Promise.race([
      this.#processFinalResult({
        text,
        isFinal: false,
        confidence: PARTIAL_TRANSLATION_CONFIDENCE,
        startTime: 0,
        endTime: 0,
      }),
      timeout,
    ]);
  }

  pushAudio(chunk: ArrayBuffer): void {
    this.asrService.pushAudio(chunk);
  }

  async stop(): Promise<void> {
    this.#session = null;
    // 清理翻译防抖定时器与状态
    if (this.#translationDebounceTimer) {
      clearTimeout(this.#translationDebounceTimer);
      this.#translationDebounceTimer = null;
    }
    this.#lastTranslatedText = "";
    this.#currentPartialText = "";
    await this.asrService.stopRecognition();
  }

  async #processFinalResult(result: ASRResult): Promise<PipelineSegment> {
    const segmentId = `seg_${String(++this.#segmentCounter).padStart(3, "0")}`;

    // 从 Session 获取上下文（最近 5 句）
    const context = this.#session
      ? this.#session.getContext(5)
      : [];

    // 传原始文本和上下文给翻译服务，prompt 构建由翻译服务负责
    this.#output?.sendStatus("translating");
    const translationResult = await this.translationService.translateWithContext({
      text: result.text,
      context,
    });

    const corrections = translationResult.corrections.map((c) => ({
      segmentId: c.targetSegmentId,
      oldEnglish: c.oldEnglish,
      newEnglish: c.newEnglish,
      oldChinese: c.oldChinese,
      newChinese: c.newChinese,
      reason: c.reason,
    }));

    return {
      segmentId,
      english: result.text,
      chinese: translationResult.translation,
      confidence: result.confidence,
      startTime: result.startTime,
      endTime: result.endTime,
      corrections,
    };
  }
}
