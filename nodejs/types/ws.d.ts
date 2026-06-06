// Type stub for ws module
declare module "ws" {
  import type { EventEmitter } from "events";
  import type { IncomingMessage } from "http";

  interface ClientOptions {
    protocolVersion?: number;
    maxPayload?: number;
  }

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly readyState: number;

    constructor(address: string | URL, options?: ClientOptions);
    constructor(address: string | URL, protocols?: string | string[], options?: ClientOptions);

    send(data: string | Buffer | ArrayBuffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    ping(data?: string | Buffer, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: string | Buffer, mask?: boolean, cb?: (err: Error) => void): void;

    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options: { port: number; host?: string });
    readonly clients: Set<WebSocket>;
    on(event: "connection", listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close", listener: () => void): this;
    close(): void;
  }

  export { WebSocket, WebSocketServer };
}
