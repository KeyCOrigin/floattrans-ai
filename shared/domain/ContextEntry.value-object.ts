// ContextEntry.value-object.ts — 上下文条目值对象
// SSOT: 前后端共享此定义

export interface ContextEntry {
  /** 历史句子的 segment ID，供 LLM 修正时精确定位 */
  readonly segmentId: string;
  readonly en: string;
  readonly zh: string;
}
