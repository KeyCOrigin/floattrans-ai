// server/compose.ts — 后端组合根
// 唯一 new 具体实现类的地方

import { AudioPipeline } from "./modules/pipeline/domain/AudioPipeline.service";
import { ContextCorrectionEngine } from "./modules/pipeline/domain/ContextCorrectionEngine.service";
import { AzureASRService } from "./modules/pipeline/infrastructure/AzureASRService";
import { GPT4MiniTranslationService } from "./modules/pipeline/infrastructure/GPT4MiniTranslationService";
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
  const asrService = new AzureASRService(config.azure.key, config.azure.region);
  const correctionEngine = new ContextCorrectionEngine();
  const translationService = new GPT4MiniTranslationService(
    config.openai.key,
    correctionEngine.buildPrompt.bind(correctionEngine),
  );
  const pipeline = new AudioPipeline(asrService, translationService, correctionEngine);
  const sessionRepo = new InMemorySessionRepository();

  return {
    asrService,
    translationService,
    correctionEngine,
    pipeline,
    sessionRepo,
  };
}
