// IAudioCaptureService.ts — 音频采集服务接口
// 定义在领域层，由基础设施层实现

import type { AudioChunk } from "./AudioChunk.value-object";

export interface AudioCaptureConfig {
  readonly sampleRate: number;
  readonly bitDepth: number;
  readonly channels: number;
}

export interface IAudioCaptureService {
  start(config: AudioCaptureConfig): Promise<void>;
  stop(): void;
  onChunk(cb: (chunk: AudioChunk) => void): void;
  isCapturing(): boolean;
}
