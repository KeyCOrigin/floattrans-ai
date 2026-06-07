// ICorrectionService.port.ts — LLM 上下文修正接口
// 定义在领域层，由基础设施层实现
// 职责：根据当前句语义 + 历史上下文，检查已显示译文是否需要修正
// 异步执行，不阻塞首发翻译管道（延迟目标 < 3s）

import type { CorrectionRequest } from "./CorrectionRequest.value-object";
import type { CorrectionSuggestion } from "./CorrectionSuggestion.value-object";

export interface ICorrectionService {
  review(req: CorrectionRequest): Promise<readonly CorrectionSuggestion[]>;
}
