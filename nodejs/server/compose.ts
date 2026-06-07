// server/compose.ts — 后端组合根
// 唯一 new 具体实现类的地方
// 双路径架构：NMT（低延迟首发翻译） + LLM（异步上下文修正）

import { AudioPipeline } from "./modules/pipeline/domain/AudioPipeline.service";
import { ContextCorrectionEngine } from "./modules/pipeline/domain/ContextCorrectionEngine.service";
import { SpeechTextNormalizer } from "./modules/pipeline/domain/SpeechTextNormalizer.service";
import { AdaptiveDebounceEngine } from "./modules/pipeline/domain/AdaptiveDebounceEngine.service";
import { PartialSegmentManager } from "./modules/pipeline/domain/PartialSegmentManager.service";
import { FinalOnlyTranslationGate } from "./modules/pipeline/infrastructure/FinalOnlyTranslationGate";
import { AzureASRService } from "./modules/pipeline/infrastructure/AzureASRService";
import { IFlytekASRService } from "./modules/pipeline/infrastructure/IFlytekASRService";
import { BaiduNMTService } from "./modules/pipeline/infrastructure/BaiduNMTService";
import { LLMCorrectionService } from "./modules/pipeline/infrastructure/LLMCorrectionService";
import { OpenAICompatibleTranslationService } from "./modules/pipeline/infrastructure/OpenAICompatibleTranslationService";
import { InMemorySessionRepository } from "./modules/session/infrastructure/InMemorySessionRepository";
import { config } from "./config";
import type { IASRService } from "./modules/pipeline/domain/IASRService.port";
import type { INMTService } from "./modules/pipeline/domain/INMTService.port";
import type { ICorrectionService } from "./modules/pipeline/domain/ICorrectionService.port";
import type { ITranslationGate } from "./modules/pipeline/domain/ITranslationGate.port";
import type { ITranslationService } from "./modules/pipeline/domain/ITranslationService.port";

export interface Dependencies {
  readonly asrService: IASRService;
  readonly nmtService: INMTService;
  readonly correctionService: ICorrectionService;
  readonly translationService: ITranslationService;
  readonly correctionEngine: ContextCorrectionEngine;
  readonly pipeline: AudioPipeline;
  readonly sessionRepo: InMemorySessionRepository;
}

export function compose(): Dependencies {
  // ASR：按 ASR_PROVIDER 环境变量选择（discriminated union，编译期保证字段完整）
  let asrService: IASRService;
  if (config.asr.provider === "iflytek") {
    asrService = new IFlytekASRService(config.asr);
  } else {
    asrService = new AzureASRService(config.asr.key, config.asr.region);
  }

  const correctionEngine = new ContextCorrectionEngine();

  // NMT 快速翻译：百度翻译（低延迟路径，目标 < 400ms）
  const nmtService: INMTService = new BaiduNMTService(
    config.nmt.appId,
    config.nmt.apiKey,
  );

  // LLM 异步修正：使用与翻译相同的 LLM 供应商（高质量路径，延迟 < 3s）
  const correctionService: ICorrectionService = new LLMCorrectionService(
    config.translation,
    correctionEngine.buildCorrectionPrompt.bind(correctionEngine),
  );

  // 翻译：通用 OpenAI 兼容服务（向后兼容保留，纯翻译路径）
  const translationService: ITranslationService = new OpenAICompatibleTranslationService(
    config.translation,
    correctionEngine.buildPrompt.bind(correctionEngine),
  );

  // 文本归一化 + 自适应防抖 + Partial 片段聚合
  const normalizer = new SpeechTextNormalizer();
  const debounceEngine = new AdaptiveDebounceEngine();
  const segmentManager = new PartialSegmentManager();

  // 翻译门控：默认仅在 ASR final 时触发 NMT，避免 partial 逐词翻译闪烁
  const translationGate: ITranslationGate = new FinalOnlyTranslationGate();

  // 双路径音频管道：NMT 首发 + LLM 异步修正 + Partial 聚合 + 翻译门控
  const pipeline = new AudioPipeline(
    asrService,
    nmtService,
    correctionService,
    normalizer,
    debounceEngine,
    segmentManager,
    translationGate,
  );
  const sessionRepo = new InMemorySessionRepository();

  return {
    asrService,
    nmtService,
    correctionService,
    translationService,
    correctionEngine,
    pipeline,
    sessionRepo,
  };
}
