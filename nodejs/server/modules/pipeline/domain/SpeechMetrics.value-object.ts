// SpeechMetrics.value-object.ts — 语音速率统计快照值对象

export interface SpeechMetrics {
  /** 当前语速（字符/秒） */
  readonly charsPerSecond: number;
  /** 距上次 partial 的间隔（ms） */
  readonly msSinceLastPartial: number;
  /** 当前文本是否以标点结尾（暗示句边界） */
  readonly punctuationEnds: boolean;
  /** 当前已输出的条目数 */
  readonly segmentCount: number;
}
