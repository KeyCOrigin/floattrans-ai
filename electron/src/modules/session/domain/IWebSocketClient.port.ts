// IWebSocketClient.port.ts — WebSocket 客户端接口
// 定义在领域层，由基础设施层实现

export interface IWebSocketClient {
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(data: unknown): void;
  sendBinary(data: ArrayBuffer): void;
  onMessage(cb: (data: unknown) => void): () => void;
  onBinary(cb: (data: ArrayBuffer) => void): () => void;
  readonly isConnected: boolean;
}
