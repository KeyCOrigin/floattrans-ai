// IPartialSegmentManager.port.ts — Partial 片段管理器接口
// 职责：判断每个 ASR partial 是同一句话的修订还是新句子

import type { SegmentState } from "./SegmentState.value-object";

export interface IPartialSegmentManager {
  /** 接受 partial 文本，返回当前 utterance 的状态 */
  acceptPartial(text: string): SegmentState;

  /** 接受 final 文本，flush 当前 utterance */
  acceptFinal(text: string): SegmentState;

  /** 重置状态（新会话） */
  reset(): void;
}
