// ITranslationService.port.ts — 翻译与纠错服务接口
// 定义在领域层，由基础设施层实现

import type { TranslationResult } from "./TranslationResult.value-object";
import type { ContextEntry } from "./ContextEntry.value-object";

export interface TranslationRequest {
  readonly text: string;
  readonly context: readonly ContextEntry[];
}

export interface ITranslationService {
  translateWithContext(req: TranslationRequest): Promise<TranslationResult>;
}
