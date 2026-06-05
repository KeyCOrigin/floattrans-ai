// server/compose.ts — 后端组合根
// 唯一 new 具体实现类的地方

import { AudioPipeline } from "./modules/pipeline/domain/AudioPipeline.service";
import { ContextCorrectionEngine } from "./modules/pipeline/domain/ContextCorrectionEngine.service";
import { AzureASRService } from "./modules/pipeline/infrastructure/AzureASRService";
import { IFlytekASRService } from "./modules/pipeline/infrastructure/IFlytekASRService";
import { OpenAICompatibleTranslationService } from "./modules/pipeline/infrastructure/OpenAICompatibleTranslationService";
import { InMemorySessionRepository } from "./modules/session/infrastructure/InMemorySessionRepository";
import { config } from "./config";
import type { IASRService } from "./modules/pipeline/domain/IASRService.port";
import type { ITranslationService } from "./modules/pipeline/domain/ITranslationService.port";

export interface Dependencies {
  readonly asrService: IASRService;
  readonly translationService: ITranslationService;
  readonly correctionEngine: ContextCorrectionEngine;
  readonly pipeline: AudioPipeline;
  readonly sessionRepo: InMemorySessionRepository;
}

export function compose(): Dependencies {
  // ASR：按 ASR_PROVIDER 环境变量选择
  const asrService: IASRService = config.asr.provider === "iflytek"
    ? new IFlytekASRService(config.asr.iflytek!)
    : new AzureASRService(config.asr.azure!.key, config.asr.azure!.region);

  const correctionEngine = new ContextCorrectionEngine();

  // 翻译：通用 OpenAI 兼容服务，按 TRANSLATION_PROVIDER 切换供应商
  const translationService: ITranslationService = new OpenAICompatibleTranslationService(
    config.translation,
    correctionEngine.buildPrompt.bind(correctionEngine),
  );

  const pipeline = new AudioPipeline(asrService, translationService, correctionEngine);
  const sessionRepo = new InMemorySessionRepository();

  return { asrService, translationService, correctionEngine, pipeline, sessionRepo };
}
