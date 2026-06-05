// WebSocketClient.ts — WebSocket 客户端封装
// 负责：连接管理、自动重连（指数退避）、消息收发

import { ConnectionError } from "../../../../../shared/errors/AppError";

export type WSMessageCallback = (data: unknown) => void;
export type WSBinaryCallback = (data: ArrayBuffer) => void;

interface ReconnectState {
  attempt: number;
  maxAttempts: number;
  baseDelay: number;
  timerId: ReturnType<typeof setTimeout> | null;
}

export class WebSocketClient {
  #ws: WebSocket | null = null;
  #url: string = "";
  #messageCallbacks = new Set<WSMessageCallback>();
  #binaryCallbacks = new Set<WSBinaryCallback>();
  #reconnectState: ReconnectState = {
    attempt: 0,
    maxAttempts: 10,
    baseDelay: 1000,
    timerId: null,
  };

  connect(url: string): Promise<void> {
    this.#url = url;
    return new Promise((resolve, reject) => {
      try {
        this.#ws = new WebSocket(url);
        this.#ws.binaryType = "arraybuffer";

        this.#ws.onopen = () => {
          this.#reconnectState.attempt = 0;
          resolve();
        };

        this.#ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            this.#binaryCallbacks.forEach((cb) => cb(event.data));
          } else if (typeof event.data === "string") {
            const parsed = JSON.parse(event.data);
            this.#messageCallbacks.forEach((cb) => cb(parsed));
          }
        };

        this.#ws.onerror = () => {
          reject(new ConnectionError("WebSocket connection failed"));
        };

        this.#ws.onclose = () => {
          this.#scheduleReconnect();
        };
      } catch (err) {
        reject(err instanceof Error ? err : new ConnectionError(String(err)));
      }
    });
  }

  disconnect(): void {
    this.#cancelReconnect();
    if (this.#ws) {
      this.#ws.onclose = null;
      this.#ws.close();
      this.#ws = null;
    }
  }

  send(data: unknown): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(data));
    }
  }

  sendBinary(data: ArrayBuffer): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(data);
    }
  }

  onMessage(cb: WSMessageCallback): () => void {
    this.#messageCallbacks.add(cb);
    return () => { this.#messageCallbacks.delete(cb); };
  }

  onBinary(cb: WSBinaryCallback): () => void {
    this.#binaryCallbacks.add(cb);
    return () => { this.#binaryCallbacks.delete(cb); };
  }

  get isConnected(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  #scheduleReconnect(): void {
    if (this.#reconnectState.attempt >= this.#reconnectState.maxAttempts) return;
    const delay = this.#reconnectState.baseDelay * Math.pow(2, this.#reconnectState.attempt);
    this.#reconnectState.attempt++;
    this.#reconnectState.timerId = setTimeout(() => {
      if (this.#url && this.#ws === null) {
        this.connect(this.#url).catch(() => {});
      }
    }, delay);
  }

  #cancelReconnect(): void {
    if (this.#reconnectState.timerId !== null) {
      clearTimeout(this.#reconnectState.timerId);
      this.#reconnectState.timerId = null;
    }
  }
}
