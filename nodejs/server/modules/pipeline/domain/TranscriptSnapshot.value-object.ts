// TranscriptSnapshot.value-object.ts — 前端传输快照值对象

import type { TranscriptLine } from "./TranscriptLine.value-object";

export interface TranscriptSnapshot {
  /** 已确认的行（english + chinese） */
  readonly lines: readonly TranscriptLine[];
  /** 文档版本号（LLM 每次修正 +1） */
  readonly version: number;
  /** ASR partial 未落盘的实时英文 */
  readonly pendingEnglish: string;
}
