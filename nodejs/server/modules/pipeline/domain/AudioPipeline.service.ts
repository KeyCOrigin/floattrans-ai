// AudioPipeline.service.ts — 音频管道领域服务
// 职责：接收音频帧 → 调 ASR → 调 LLM → 生成字幕片段与修正
// 不持有业务状态（状态在 Session 中），仅持有会话引用用于上下文查询

import type { IASRService } from "./IASRService.port";
import type { ITranslationService } from "./ITranslationService.port";
import type { ContextCorrectionEngine } from "./ContextCorrectionEngine.service";
import type { ASRResult } from "./ASRResult.value-object";
import type { Session } from "../../session/domain/Session.entity";
import { TranslationError } from "../../../../../shared/errors/AppError";

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

  constructor(
    private readonly asrService: IASRService,
    private readonly translationService: ITranslationService,
    private readonly correctionEngine: ContextCorrectionEngine,
  ) {}

  async start(session: Session): Promise<void> {
    this.#session = session;
    this.#segmentCounter = 0;
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
    });

    this.asrService.onFinalResult(async (result: ASRResult) => {
      try {
        const segment = await this.#processFinalResult(result);
        if (segment) {
          onSegment(segment);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(new TranslationError(message));
      }
    });

    this.asrService.onError(onError);
  }

  pushAudio(chunk: ArrayBuffer): void {
    this.asrService.pushAudio(chunk);
  }

  async stop(): Promise<void> {
    this.#session = null;
    await this.asrService.stopRecognition();
  }

  async #processFinalResult(result: ASRResult): Promise<PipelineSegment> {
    const segmentId = `seg_${String(++this.#segmentCounter).padStart(3, "0")}`;

    // 从 Session 获取上下文（最近 5 句）
    const context = this.#session
      ? this.#session.getContext(5)
      : [];

    // 通过 ContextCorrectionEngine 构建包含上下文和纠错指令的 prompt
    const prompt = this.correctionEngine.buildPrompt(result.text, context);

    const translationResult = await this.translationService.translateWithContext({
      text: prompt.userPrompt,
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
