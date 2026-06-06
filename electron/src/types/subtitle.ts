// ============================================================
// FloatTrans AI — 字幕相关类型定义
// SSOT: 字幕领域类型与弹幕显示类型
// IPC 协议类型见 ./overlay.ts
// ============================================================

import type { OverlayStylePayload } from "./overlay";

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

// ============================================================
// 弹幕覆盖层类型
// ============================================================

export type DanmakuStatus = "draft" | "corrected" | "final";

export type DanmakuAnimation = "push" | "correct" | "evict";

export interface DanmakuDisplayEntry {
  readonly id: string;
  readonly english: string;
  chinese: string;
  status: DanmakuStatus;
  readonly confidence: number;
  readonly createdAt: number;
  /** 动画标记：用于触发一次性 CSS 动画 */
  animation?: DanmakuAnimation;
}

export interface DanmakuPushPayload {
  id: string;
  english: string;
  chinese: string;
  status: DanmakuStatus;
  confidence: number;
}

export interface DanmakuUpdatePayload {
  id: string;
  chinese: string;
  isComplete: boolean;
}

export interface DanmakuCorrectPayload {
  id: string;
  oldChinese: string;
  newChinese: string;
}

export interface DanmakuEvictPayload {
  id: string;
}

export interface ElectronAPI {
  updateSubtitle: (payload: SubtitlePayload) => void;
  onSubtitleUpdate: (callback: (payload: SubtitlePayload) => void) => void;
  removeSubtitleUpdateListener: (callback: (payload: SubtitlePayload) => void) => void;
  // 弹幕 IPC API（preload 暴露后始终存在，调用方使用可选链作防御）
  danmakuPush?: (payload: DanmakuPushPayload) => void;
  danmakuUpdate?: (payload: DanmakuUpdatePayload) => void;
  danmakuCorrect?: (payload: DanmakuCorrectPayload) => void;
  danmakuEvict?: (payload: DanmakuEvictPayload) => void;
  danmakuClear?: () => void;
  onDanmakuPush?: (callback: (payload: DanmakuPushPayload) => void) => void;
  onDanmakuUpdate?: (callback: (payload: DanmakuUpdatePayload) => void) => void;
  onDanmakuCorrect?: (callback: (payload: DanmakuCorrectPayload) => void) => void;
  onDanmakuEvict?: (callback: (payload: DanmakuEvictPayload) => void) => void;
  onDanmakuClear?: (callback: () => void) => void;
  removeDanmakuPushListener?: (callback: (payload: DanmakuPushPayload) => void) => void;
  removeDanmakuUpdateListener?: (callback: (payload: DanmakuUpdatePayload) => void) => void;
  removeDanmakuCorrectListener?: (callback: (payload: DanmakuCorrectPayload) => void) => void;
  removeDanmakuEvictListener?: (callback: (payload: DanmakuEvictPayload) => void) => void;
  removeDanmakuClearListener?: (callback: () => void) => void;
  // 悬浮窗行为控制
  setOverlayClickThrough?: (enabled: boolean) => void;
  resizeOverlay?: (width: number, height: number) => void;
  // 样式同步：控制面板 → overlay 弹幕字幕
  applyOverlayStyle?: (payload: OverlayStylePayload) => void;
  onOverlayApplyStyle?: (callback: (payload: OverlayStylePayload) => void) => void;
  removeOverlayApplyStyleListener?: (callback: (payload: OverlayStylePayload) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const defaultSettings = {
  showEnglish: true,
  showChinese: true,
  opacity: 0.85,
  fontSize: 28,
  subtitleColor: "#ffffff",
  autoCorrectionEnabled: true,
};
