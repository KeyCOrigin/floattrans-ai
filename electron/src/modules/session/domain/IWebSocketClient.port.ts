// IWebSocketClient.port.ts — WebSocket 客户端接口
// 定义在领域层，由基础设施层实现

export interface SessionAudioFormat {
  readonly sampleRate: number;
  readonly bitDepth: number;
  readonly channels: number;
}

export interface IWebSocketClient {
  connect(url: string): Promise<void>;
  disconnect(): void;
  /** 发送会话启动握手（协议细节由实现封装） */
  startSession(format: SessionAudioFormat): void;
  /** 发送会话停止通知（协议细节由实现封装） */
  stopSession(): void;
  sendBinary(data: ArrayBuffer): void;
  onMessage(cb: (data: unknown) => void): () => void;
  onBinary(cb: (data: ArrayBuffer) => void): () => void;
  readonly isConnected: boolean;
}
