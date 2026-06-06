// AudioPipeline.service.ts — 音频管道领域服务
// 职责：接收音频帧 → 归一化 → 自适应防抖 → 调翻译 → 弹幕输出
// 不持有业务状态（状态在 Session 中），仅持有会话引用用于上下文查询

import type { IASRService } from "./IASRService.port";
import type { ITranslationService } from "./ITranslationService.port";
import type { ASRResult } from "./ASRResult.value-object";
import type { Session } from "../../session/domain/Session.entity";
import type { PipelineOutputPort, DanmakuEntrySnapshot } from "./PipelineOutputPort.port";
import type { ISpeechTextNormalizer } from "./ISpeechTextNormalizer.port";
import type { IAdaptiveDebounceStrategy } from "./IAdaptiveDebounceStrategy.port";
import type { SpeechMetrics } from "./SpeechMetrics.value-object";
import { TranslationError } from "../../../../../shared/errors/AppError";

/** 单次翻译超时（ms） */
const TRANSLATION_TIMEOUT_MS = 15000;
/** 部分翻译置信度 */
const PARTIAL_TRANSLATION_CONFIDENCE = 0.85;
/** 语速计算滑窗大小（最近 N 次 partial） */
const SPEECH_RATE_WINDOW = 3;
/** 弹幕池最大条目数 */
const MAX_DANMAKU_ENTRIES = 10;

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

  /** 上次翻译的文本 */
  #lastTranslatedText = "";
  /** 当前累积的 partial 文本 */
  #currentPartialText = "";
  /** 翻译防抖定时器 */
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 防止并发翻译 */
  #isTranslating = false;

  /** 语速滑窗：记录最近 N 次 partial 的时间戳和文本长度 */
  #speechRateSamples: Array<{ time: number; length: number }> = [];

  /** 当前弹幕池条目数 */
  #danmakuCount = 0;

  constructor(
    private readonly asrService: IASRService,
    private readonly translationService: ITranslationService,
    private readonly normalizer: ISpeechTextNormalizer,
    private readonly debounceEngine: IAdaptiveDebounceStrategy,
  ) {}

  async start(session: Session, output: PipelineOutputPort): Promise<void> {
    this.#session = session;
    this.#output = output;
    this.#segmentCounter = 0;
    this.#danmakuCount = 0;
    this.#lastTranslatedText = "";
    this.#currentPartialText = "";
    this.#speechRateSamples = [];
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
    this.asrService.onPartialResult((rawText) => {
      // 1) 归一化
      const norm = this.normalizer.normalizeForTranslation(rawText);
      // 2) 即时推送英文 partial 到前端
      onPartial(norm.normalized, Date.now());
      // 3) 自适应防抖决策
      this.#scheduleTranslation(norm.normalized, onSegment, onError);
      // 4) 更新语速统计
      this.#recordSpeechSample(rawText.length);
    });

    this.asrService.onFinalResult(async (result: ASRResult) => {
      try {
        if (this.#debounceTimer) {
          clearTimeout(this.#debounceTimer);
          this.#debounceTimer = null;
        }
        const norm = this.normalizer.normalizeForTranslation(result.text);
        if (norm.normalized && norm.normalized !== this.#lastTranslatedText) {
          const segment = await this.#processFinalResult({
            ...result,
            text: norm.normalized,
          });
          if (segment) {
            this.#lastTranslatedText = norm.normalized;
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

  /** 自适应防抖 + 翻译调度 */
  #scheduleTranslation(
    text: string,
    onSegment: PipelineCallback,
    onError: ErrorCallback,
  ): void {
    this.#currentPartialText = text;
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);

    // 正在翻译 → 延迟等待
    if (this.#isTranslating) {
      this.#debounceTimer = setTimeout(() => {
        this.#debounceTimer = null;
        this.#executeTranslation(this.#currentPartialText, onSegment, onError);
      }, 300);
      return;
    }

    const metrics = this.#computeSpeechMetrics(text);
    const decision = this.debounceEngine.decide(text, this.#lastTranslatedText, metrics);

    if (!decision.shouldTranslate) return;

    if (decision.debounceMs === 0) {
      this.#executeTranslation(text, onSegment, onError);
      return;
    }

    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      this.#executeTranslation(this.#currentPartialText, onSegment, onError);
    }, decision.debounceMs);
  }

  /** 执行翻译 + 弹幕推送 */
  async #executeTranslation(
    text: string,
    onSegment: PipelineCallback,
    onError: ErrorCallback,
  ): Promise<void> {
    if (!text || text === this.#lastTranslatedText || this.#isTranslating) return;

    this.#isTranslating = true;
    const segmentId = `seg_${String(++this.#segmentCounter).padStart(3, "0")}`;

    // 弹幕推入（draft 状态，先用英文占位）
    const snapshot: DanmakuEntrySnapshot = {
      id: segmentId,
      english: text,
      chinese: "",
      status: "draft",
      confidence: PARTIAL_TRANSLATION_CONFIDENCE,
    };
    this.#output?.sendDanmakuPush(snapshot);

    // 弹幕池管理
    this.#danmakuCount++;
    if (this.#danmakuCount > MAX_DANMAKU_ENTRIES) {
      const evictId = `seg_${String(this.#segmentCounter - MAX_DANMAKU_ENTRIES).padStart(3, "0")}`;
      this.#output?.sendDanmakuEvict(evictId);
    }

    try {
      // 流式翻译（逐步更新弹幕中文）
      const accumulatedChinese = await this.#translateWithStreamingUpdate(
        text,
        segmentId,
      );

      // 归一化翻译输出
      const normalizedChinese = this.normalizer.normalizeTranslationOutput(accumulatedChinese);

      // 弹幕最终更新
      this.#output?.sendDanmakuUpdate(segmentId, normalizedChinese, true);

      // 完整 segment 输出（用于历史记录、修正等）
      const segment = await this.#processFinalResult({
        text,
        isFinal: false,
        confidence: PARTIAL_TRANSLATION_CONFIDENCE,
        startTime: 0,
        endTime: 0,
      });
      if (segment) {
        this.#lastTranslatedText = text;
        onSegment({
          ...segment,
          chinese: normalizedChinese,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onError(new TranslationError(message));
    } finally {
      this.#isTranslating = false;
    }
  }

  /**
   * 翻译并逐 token 更新弹幕中文（模拟流式效果）。
   * 当前 Zhipu API 使用非流式请求，通过分词模拟逐步更新。
   */
  async #translateWithStreamingUpdate(
    text: string,
    segmentId: string,
  ): Promise<string> {
    const context = this.#session ? this.#session.getContext(5) : [];

    this.#output?.sendStatus("translating");
    const result = await Promise.race([
      this.translationService.translateWithContext({ text, context }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new TranslationError(`Translation timed out after ${TRANSLATION_TIMEOUT_MS}ms`)),
          TRANSLATION_TIMEOUT_MS,
        );
      }),
    ]);

    const chinese = result.translation;
    // 模拟流式：按 UTF-16 字符逐步推送更新
    const chars = [...chinese];
    const steps = Math.min(chars.length, 8);
    const chunkSize = Math.max(1, Math.floor(chars.length / steps));

    for (let i = chunkSize; i <= chars.length; i += chunkSize) {
      const partial = chars.slice(0, i).join("");
      this.#output?.sendDanmakuUpdate(segmentId, partial, i >= chars.length);
      await new Promise((r) => setTimeout(r, 40));
    }

    return chinese;
  }

  /** 计算实时语速指标 */
  #computeSpeechMetrics(text: string): SpeechMetrics {
    const now = Date.now();
    this.#recordSpeechSample(text.length);

    // 最近 N 次的平均语速
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
      segmentCount: this.#danmakuCount,
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
    this.#danmakuCount = 0;
    this.#speechRateSamples = [];
    await this.asrService.stopRecognition();
  }

  async #processFinalResult(result: ASRResult): Promise<PipelineSegment> {
    const segmentId = `seg_${String(++this.#segmentCounter).padStart(3, "0")}`;

    const context = this.#session
      ? this.#session.getContext(5)
      : [];

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
