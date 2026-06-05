// WebSocketClient.ts — WebSocket 客户端封装
// 负责：连接管理、自动重连（仅断线重连，连接失败不重连）、消息收发

import type { IWebSocketClient, SessionAudioFormat } from "../domain/IWebSocketClient.port";
import { ConnectionError } from "../../../../../shared/errors/AppError";

export type WSMessageCallback = (data: unknown) => void;
export type WSBinaryCallback = (data: ArrayBuffer) => void;

interface ReconnectState {
  attempt: number;
  maxAttempts: number;
  baseDelay: number;
  timerId: ReturnType<typeof setTimeout> | null;
}

export class WebSocketClient implements IWebSocketClient {
  #ws: WebSocket | null = null;
  #url: string = "";
  #messageCallbacks = new Set<WSMessageCallback>();
  #binaryCallbacks = new Set<WSBinaryCallback>();
  #wasEverConnected = false;
  #reconnectState: ReconnectState = {
    attempt: 0,
    maxAttempts: 10,
    baseDelay: 1000,
    timerId: null,
  };

  connect(url: string): Promise<void> {
    this.#url = url;
    this.#wasEverConnected = false;
    return new Promise((resolve, reject) => {
      try {
        this.#ws = new WebSocket(url);
        this.#ws.binaryType = "arraybuffer";

        this.#ws.onopen = () => {
          this.#wasEverConnected = true;
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
          // 仅在曾经连通过的情况下才断线重连（连接失败不重连）
          if (this.#wasEverConnected) {
            this.#scheduleReconnect();
          }
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

  startSession(format: SessionAudioFormat): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify({ type: "session:start", audioFormat: format }));
    }
  }

  stopSession(): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify({ type: "session:stop" }));
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
      if (this.#url) {
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
