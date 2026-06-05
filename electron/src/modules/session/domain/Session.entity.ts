// Session.entity.ts — 会话实体（前端）
// 管理客户端侧的会话状态

import { InvalidStateError } from "../../../../../shared/errors/AppError";
import { SessionStateEnum, type SessionStateValue } from "./SessionState.value-object";

export class FrontendSession {
  readonly #id: string;
  #state: SessionStateValue = SessionStateEnum.IDLE;
  #mode: "demo" | "live";
  #wsEndpoint: string | null = null;

  private constructor(id: string, mode: "demo" | "live") {
    this.#id = id;
    this.#mode = mode;
  }

  static create(mode: "demo" | "live", wsEndpoint?: string): FrontendSession {
    const id = `fsess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = new FrontendSession(id, mode);
    if (wsEndpoint) {
      session.#wsEndpoint = wsEndpoint;
    }
    return session;
  }

  get id(): string { return this.#id; }
  get state(): SessionStateValue { return this.#state; }
  get mode(): "demo" | "live" { return this.#mode; }
  get wsEndpoint(): string | null { return this.#wsEndpoint; }

  setConnecting(): void {
    if (this.#state !== SessionStateEnum.IDLE) {
      throw new InvalidStateError(this.#state, SessionStateEnum.IDLE, "setConnecting");
    }
    this.#state = SessionStateEnum.CONNECTING;
  }

  setListening(): void {
    if (this.#state !== SessionStateEnum.CONNECTING) {
      throw new InvalidStateError(this.#state, SessionStateEnum.CONNECTING, "setListening");
    }
    this.#state = SessionStateEnum.LISTENING;
  }

  setPaused(): void {
    if (this.#state !== SessionStateEnum.LISTENING) {
      throw new InvalidStateError(this.#state, SessionStateEnum.LISTENING, "setPaused");
    }
    this.#state = SessionStateEnum.PAUSED;
  }

  setStopped(): void {
    this.#state = SessionStateEnum.STOPPED;
  }

  isLive(): boolean { return this.#mode === "live"; }
  isDemo(): boolean { return this.#mode === "demo"; }
}
