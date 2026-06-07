// server/compose.ts — 后端组合根（v4: 文档流架构）
// 唯一 new 具体实现类的地方

import { AudioPipeline } from "./modules/pipeline/domain/AudioPipeline.service";
import { MergeGroupManager } from "./modules/pipeline/domain/MergeGroupManager.service";
import { AzureASRService } from "./modules/pipeline/infrastructure/AzureASRService";
import { IFlytekASRService } from "./modules/pipeline/infrastructure/IFlytekASRService";
import { BaiduNMTService } from "./modules/pipeline/infrastructure/BaiduNMTService";
import { NmtSchedulerService } from "./modules/pipeline/infrastructure/NmtSchedulerService";
import { LLMCorrectionService } from "./modules/pipeline/infrastructure/LLMCorrectionService";
import { MarkdownFileRepository } from "./modules/pipeline/infrastructure/MarkdownFileRepository";
import { InMemorySessionRepository } from "./modules/session/infrastructure/InMemorySessionRepository";
import { config } from "./config";
import type { IASRService } from "./modules/pipeline/domain/IASRService.port";
import type { INMTService } from "./modules/pipeline/domain/INMTService.port";
import type { ICorrectionService } from "./modules/pipeline/domain/ICorrectionService.port";

export interface Dependencies {
  readonly asrService: IASRService;
  readonly nmtService: INMTService;
  readonly correctionService: ICorrectionService;
  readonly pipeline: AudioPipeline;
  readonly sessionRepo: InMemorySessionRepository;
}

export function compose(): Dependencies {
  // ASR：按 ASR_PROVIDER 环境变量选择
  let asrService: IASRService;
  if (config.asr.provider === "iflytek") {
    asrService = new IFlytekASRService(config.asr);
  } else {
    asrService = new AzureASRService(config.asr.key, config.asr.region);
  }

  // NMT 快速翻译：百度翻译 + 调度器（去重/并发/超时）
  // 调度器作为 Decorator 包装底层 HTTP 适配器，INMTService 接口不变
  let nmtService: INMTService;
  if (config.nmt.provider === "baidu" && config.nmt.appId && config.nmt.apiKey) {
    const baidu = new BaiduNMTService(config.nmt.appId, config.nmt.apiKey);
    nmtService = new NmtSchedulerService(baidu, 3);
  } else {
    nmtService = {
      translate: async (text: string) => {
        process.stderr.write("[NMT] placeholder — using raw English\n");
        return text;
      },
    };
  }

  // LLM 全文修正
  const correctionService: ICorrectionService = new LLMCorrectionService({
    baseUrl: config.translation.baseUrl,
    apiKey: config.translation.apiKey,
    model: config.translation.model,
  });

  // 文档持久化
  const repository = new MarkdownFileRepository();

  // 合并组管理器（Phase 2：LLM 合并不删行）
  const mergeGroupManager = new MergeGroupManager();

  // 文档流管道（不再需要 Normalizer / Debounce / SegmentManager / Gate）
  const pipeline = new AudioPipeline(
    asrService,
    nmtService,
    correctionService,
    repository,
    mergeGroupManager,
  );

  const sessionRepo = new InMemorySessionRepository();

  return {
    asrService,
    nmtService,
    correctionService,
    pipeline,
    sessionRepo,
  };
}
