// AudioFormat.value-object.ts — 音频格式值对象

export interface AudioFormat {
  readonly sampleRate: number;
  readonly bitDepth: number;
  readonly channels: number;
}
