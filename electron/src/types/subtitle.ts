// ============================================================
// FloatTrans AI — 字幕相关类型定义
// SSOT: 所有字幕相关类型集中定义于此
// ============================================================

export type SubtitleStatus = "pending" | "active" | "final" | "revised";

export interface SubtitleSegment {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  english: string;
  chinese: string;
  status: SubtitleStatus;
  readonly confidence?: number;
}

export interface CorrectionEvent {
  readonly triggerAt: number;
  readonly segmentId: string;
  readonly oldEnglish: string;
  readonly newEnglish: string;
  readonly oldChinese: string;
  readonly newChinese: string;
  readonly reason: string;
  applied: boolean;
}

export interface CorrectionLog {
  readonly id: string;
  readonly time: number;
  readonly segmentId: string;
  readonly oldEnglish: string;
  readonly newEnglish: string;
  readonly oldChinese: string;
  readonly newChinese: string;
  readonly reason: string;
}

export interface TickResult {
  readonly currentSegment: SubtitleSegment | null;
  readonly newCorrections: readonly CorrectionLog[];
  readonly currentTime: number;
}

export interface EngineState {
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly currentSegmentId: string | null;
  readonly correctionLogs: readonly CorrectionLog[];
}

export interface SubtitlePayload {
  readonly english: string;
  readonly chinese: string;
  readonly status: SubtitleStatus;
  readonly showEnglish: boolean;
  readonly showChinese: boolean;
  readonly opacity: number;
  readonly fontSize: number;
  readonly subtitleColor: string;
}

export const defaultSettings = {
  showEnglish: true,
  showChinese: true,
  opacity: 0.85,
  fontSize: 28,
  subtitleColor: "#ffffff",
  autoCorrectionEnabled: true,
};

export interface ElectronAPI {
  updateSubtitle: (payload: SubtitlePayload) => void;
  onSubtitleUpdate: (callback: (payload: SubtitlePayload) => void) => void;
  removeSubtitleUpdateListener: (callback: (payload: SubtitlePayload) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
