// SegmentState.value-object.ts — Partial 聚合状态值对象
// 描述 PartialSegmentManager 对每个 ASR 片段的判定结果

export interface SegmentState {
  /** 当前 utterance 的唯一 ID（同一句话的多次 partial 共享） */
  readonly segmentId: string;
  /** 当前文本 */
  readonly text: string;
  /** 是否是新的 utterance（需要 push 新弹幕条目） */
  readonly isNewUtterance: boolean;
  /** 是否达到 flush 条件（ASR final / 句边界 / 上下文突变） */
  readonly isFinal: boolean;
}
