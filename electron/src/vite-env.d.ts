/// <reference types="vite/client" />

interface ElectronAPI {
  updateSubtitle(payload: unknown): void;
  onSubtitleUpdate(callback: (payload: unknown) => void): void;
  removeSubtitleUpdateListener(callback: (payload: unknown) => void): void;
}

declare global {
  interface Window {
    readonly electronAPI?: ElectronAPI;
  }
}
