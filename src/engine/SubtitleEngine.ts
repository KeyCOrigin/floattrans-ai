// ============================================================
// SubtitleEngine — 纯逻辑类，零框架依赖
// 可脱离 Electron / React 独立单元测试
// ============================================================

import type {
  SubtitleSegment, CorrectionEvent, CorrectionLog,
  TickResult, EngineState,
} from "../types/subtitle";

type OnTick = (result: TickResult) => void;

export class SubtitleEngine {
  #isPlaying = false;
  #currentTime = 0;
  #currentSegmentId: string | null = null;
  #correctionLogs: CorrectionLog[] = [];
  #onTick: OnTick | null = null;
  #autoCorrectionEnabled = true;
  readonly #generateId: () => string;

  constructor(
    private readonly segments: SubtitleSegment[],
    private readonly correctionEvents: CorrectionEvent[],
    generateId?: () => string,
  ) {
    this.#generateId = generateId ?? (() => crypto.randomUUID());
  }

  // ===== 播放控制 =====

  start(onTick: OnTick): void {
    this.#isPlaying = true;
    this.#onTick = onTick;
  }

  pause(): void {
    this.#isPlaying = false;
  }

  stop(): void {
    this.#isPlaying = false;
    this.#currentTime = 0;
    this.#currentSegmentId = null;
    this.#onTick = null;
    this.#correctionLogs = [];
    for (const event of this.correctionEvents) event.applied = false;
    for (const segment of this.segments) {
      if (segment.status === "revised") segment.status = "final";
    }
  }

  reset(): void {
    this.stop();
  }

  setAutoCorrection(enabled: boolean): void {
    this.#autoCorrectionEnabled = enabled;
  }

  // ===== 核心 tick =====

  tick(deltaSeconds: number): TickResult {
    if (!this.#isPlaying) {
      return { currentSegment: null, newCorrections: [], currentTime: this.#currentTime };
    }
    this.#currentTime += deltaSeconds;
    const newCorrections = this.#applyDueCorrections();
    const currentSegment = this.#findCurrentSegment();
    this.#currentSegmentId = currentSegment?.id ?? null;
    const result: TickResult = { currentSegment, newCorrections, currentTime: this.#currentTime };
    this.#onTick?.(result);
    return result;
  }

  // ===== 查询 =====

  getState(): EngineState {
    return {
      isPlaying: this.#isPlaying,
      currentTime: this.#currentTime,
      currentSegmentId: this.#currentSegmentId,
      correctionLogs: this.#correctionLogs,
    };
  }

  // ===== 私有方法 =====

  #findCurrentSegment(): SubtitleSegment | null {
    return this.segments.find(
      (s) => this.#currentTime >= s.start && this.#currentTime <= s.end
    ) ?? null;
  }

  #applyDueCorrections(): CorrectionLog[] {
    if (!this.#autoCorrectionEnabled) return [];

    const newLogs: CorrectionLog[] = [];
    for (const event of this.correctionEvents) {
      if (event.applied || this.#currentTime < event.triggerAt) continue;
      const segment = this.segments.find((s) => s.id === event.segmentId);
      if (!segment) continue;
      segment.english = event.newEnglish;
      segment.chinese = event.newChinese;
      segment.status = "revised";
      event.applied = true;
      const log: CorrectionLog = {
        id: this.#generateId(),
        time: this.#currentTime,
        segmentId: event.segmentId,
        oldEnglish: event.oldEnglish,
        newEnglish: event.newEnglish,
        oldChinese: event.oldChinese,
        newChinese: event.newChinese,
        reason: event.reason,
      };
      this.#correctionLogs.push(log);
      newLogs.push(log);
    }
    return newLogs;
  }
}
