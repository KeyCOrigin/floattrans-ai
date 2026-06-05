// IAudioCaptureService.ts — 音频采集服务接口
// 定义在领域层，由基础设施层实现

import type { AudioChunk } from "./AudioChunk.value-object";
import type { AudioDevice } from "./AudioDevice.value-object";

export interface AudioCaptureConfig {
  readonly sampleRate: number;
  readonly bitDepth: number;
  readonly channels: number;
}

export interface IAudioCaptureService {
  /** 枚举可用音频输入设备（内部自动处理权限） */
  enumerateDevices(): Promise<AudioDevice[]>;
  /** 按指定设备启动采集 */
  start(config: AudioCaptureConfig, deviceId: string): Promise<void>;
  stop(): void;
  onChunk(cb: (chunk: AudioChunk) => void): void;
  isCapturing(): boolean;
}
