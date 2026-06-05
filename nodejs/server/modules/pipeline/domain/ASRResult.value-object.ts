// ASRResult.value-object.ts — 语音识别结果值对象

export interface ASRResult {
  readonly text: string;
  readonly isFinal: boolean;
  readonly confidence: number;
  readonly startTime: number;
  readonly endTime: number;
}
