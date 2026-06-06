// overlay.ts — 覆盖窗口 IPC 通信协议类型
// 控制面板 ↔ 叠加窗口样式同步

/** 控制面板 → overlay 弹幕字幕样式同步 */
export interface OverlayStylePayload {
  showEnglish: boolean;
  showChinese: boolean;
  opacity: number;
  fontSize: number;
  subtitleColor: string;
}
