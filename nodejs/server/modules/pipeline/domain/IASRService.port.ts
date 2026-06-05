// IASRService.port.ts — 语音识别服务接口
// 定义在领域层，由基础设施层实现

import type { ASRResult } from "./ASRResult.value-object";

// ===== 共享回调类型 =====
// 基础设施层实现类统一引用，避免跨文件重复定义

export type ASRFinalCallback = (result: ASRResult) => void;
export type ASRPartialCallback = (text: string) => void;
export type ASRErrorCallback = (error: Error) => void;

// ===== 配置与接口 =====

export interface ASRConfig {
  readonly language: string;
  readonly sampleRate: number;
}

export interface IASRService {
  startRecognition(config: ASRConfig): Promise<void>;
  pushAudio(chunk: ArrayBuffer): void;
  stopRecognition(): Promise<void>;
  onFinalResult(cb: ASRFinalCallback): void;
  onPartialResult(cb: ASRPartialCallback): void;
  onError(cb: ASRErrorCallback): void;
}
