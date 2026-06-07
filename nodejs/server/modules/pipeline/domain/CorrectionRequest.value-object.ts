// CorrectionRequest.value-object.ts — 修正请求值对象

import type { ContextEntry } from "./ContextEntry.value-object";

export interface CorrectionRequest {
  /** 当前句英文原文 */
  readonly currentText: string;
  /** NMT 已产生的当前句中文译文 */
  readonly currentTranslation: string;
  /** 当前句的 segmentId（LLM 可返回当前句的修正） */
  readonly currentSegmentId: string;
  /** 历史上下文（最近 N 条，按时间从旧到新排列） */
  readonly history: readonly ContextEntry[];
}
