// Minimal type stub for ws module (npm install not available in this environment)
declare module "ws" {
  import type { EventEmitter } from "events";

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    static readonly CONNECTING: number;
    readonly readyState: number;
    send(data: string | Buffer | ArrayBuffer | Uint8Array): void;
    close(): void;
    on(event: "message", listener: (data: Buffer | ArrayBuffer | string) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "open", listener: () => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { port: number });
    on(event: "connection", listener: (ws: WebSocket) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close", listener: () => void): this;
    close(): void;
  }
}
