// IASRService.port.ts — 语音识别服务接口
// 定义在领域层，由基础设施层实现

import type { ASRResult } from "./ASRResult.value-object";

export interface ASRConfig {
  readonly language: string;
  readonly sampleRate: number;
}

export interface IASRService {
  startRecognition(config: ASRConfig): Promise<void>;
  pushAudio(chunk: ArrayBuffer): void;
  stopRecognition(): Promise<void>;
  onFinalResult(cb: (result: ASRResult) => void): void;
  onPartialResult(cb: (text: string) => void): void;
  onError(cb: (error: Error) => void): void;
}
