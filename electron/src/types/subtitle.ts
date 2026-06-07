// electron-api.ts — Electron IPC 通信协议类型定义（v5: Markdown 文档流）

// === Electron IPC API ===

export interface ElectronAPI {
  // 文档流 IPC（控制面板 → overlay）
  sendDocumentContent?: (payload: { markdown: string; version: number }) => void;
  sendDocumentClear?: () => void;

  // 文档流监听（overlay 接收）
  onDocumentContent?: (callback: (payload: unknown) => void) => void;
  onDocumentClear?: (callback: () => void) => void;
  removeDocumentContentListener?: (callback: (payload: unknown) => void) => void;
  removeDocumentClearListener?: (callback: () => void) => void;

  // 悬浮窗控制
  openOverlay?: () => void;
  closeOverlay?: () => void;

  // 样式同步
  applyOverlayStyle?: (payload: {
    opacity: number;
    fontSize: number;
    textColor: string;
  }) => void;
  onOverlayApplyStyle?: (callback: (payload: unknown) => void) => void;
  removeOverlayApplyStyleListener?: (callback: (payload: unknown) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const defaultSettings = {
  opacity: 0.85,
  fontSize: 28,
  textColor: "#ffffff",
};
