// AudioChunk.value-object.ts — 音频块值对象

export interface AudioChunk {
  readonly buffer: ArrayBuffer;
  readonly timestamp: number;
  readonly duration: number;
}
