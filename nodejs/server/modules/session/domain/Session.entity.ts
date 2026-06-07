// Session.entity.ts — 会话聚合根（后端）
// 管理实时会话状态和字幕片段

import type { AudioFormat } from "./AudioFormat.value-object";
import { InvalidStateError } from "../../../../../shared/errors/AppError";

export type SessionState = "idle" | "listening" | "paused" | "stopped";

export interface SessionSegment {
  readonly id: string;
  readonly startTime: number;
  readonly endTime: number;
  english: string;
  chinese: string;
  status: "pending" | "active" | "final" | "revised";
  readonly confidence: number;
}

export interface SessionCorrection {
  readonly segmentId: string;
  readonly oldEnglish: string;
  readonly newEnglish: string;
  readonly oldChinese: string;
  readonly newChinese: string;
  readonly reason: string;
}

export class Session {
  readonly id: string;
  #state: SessionState = "idle";
  readonly #segments: SessionSegment[] = [];
  readonly #corrections: SessionCorrection[] = [];
  readonly #startedAt: number;
  readonly #audioFormat: AudioFormat;

  private constructor(
    id: string,
    audioFormat: AudioFormat,
  ) {
    this.id = id;
    this.#audioFormat = audioFormat;
    this.#startedAt = Date.now();
  }

  static create(audioFormat: AudioFormat): Session {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Session(id, audioFormat);
  }

  get state(): SessionState { return this.#state; }
  get segments(): readonly SessionSegment[] { return this.#segments; }
  get corrections(): readonly SessionCorrection[] { return this.#corrections; }
  get startedAt(): number { return this.#startedAt; }
  get audioFormat(): AudioFormat { return this.#audioFormat; }

  start(): void {
    if (this.#state !== "idle") {
      throw new InvalidStateError(this.#state, "idle", "start");
    }
    this.#state = "listening";
  }

  pause(): void {
    if (this.#state !== "listening") {
      throw new InvalidStateError(this.#state, "listening", "pause");
    }
    this.#state = "paused";
  }

  stop(): void {
    if (this.#state === "idle") {
      throw new InvalidStateError(this.#state, "listening or paused", "stop");
    }
    this.#state = "stopped";
  }

  addSegment(segment: SessionSegment): void {
    if (this.#state !== "listening" && this.#state !== "paused") {
      throw new InvalidStateError(this.#state, "listening or paused", "addSegment");
    }
    this.#segments.push(segment);
  }

  applyCorrection(correction: SessionCorrection): void {
    if (this.#state === "idle") {
      throw new InvalidStateError(this.#state, "listening, paused, or stopped", "applyCorrection");
    }
    this.#corrections.push(correction);
    const segment = this.#segments.find((s) => s.id === correction.segmentId);
    if (segment) {
      segment.english = correction.newEnglish;
      segment.chinese = correction.newChinese;
      segment.status = "revised";
    }
  }

  getContext(contextSize: number): Array<{ segmentId: string; en: string; zh: string }> {
    return this.#segments
      .slice(-contextSize)
      .map((s) => ({ segmentId: s.id, en: s.english, zh: s.chinese }));
  }
}
