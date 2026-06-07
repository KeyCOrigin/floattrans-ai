// ASRResult.value-object.ts — 语音识别结果值对象

import type { EnrichedASRWord } from "./EnrichedASRWord.value-object";

export interface ASRResult {
  readonly text: string;
  readonly isFinal: boolean;
  readonly confidence: number;
  readonly startTime: number;
  readonly endTime: number;
  /** 逐词元数据（仅支持词级元数据的 ASR 返回，如 iFlytek） */
  readonly words?: readonly EnrichedASRWord[];
  /** 当前结果是否包含标点词 */
  readonly hasPunctuation?: boolean;
  /** 当前结果是否包含分段标识 */
  readonly hasSegmentBreak?: boolean;
}
