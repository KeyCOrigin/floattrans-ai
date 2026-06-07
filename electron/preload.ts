import { contextBridge, ipcRenderer } from "electron";

const listenerMap = new WeakMap<(...args: unknown[]) => void, (...args: unknown[]) => void>();

contextBridge.exposeInMainWorld("electronAPI", {
  updateSubtitle: (payload: unknown) =>
    ipcRenderer.send("subtitle:update", payload),

  onSubtitleUpdate: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("subtitle:update", wrapper);
  },

  removeSubtitleUpdateListener: (callback: (payload: unknown) => void) => {
    const wrapper = listenerMap.get(callback);
    if (wrapper) {
      ipcRenderer.removeListener("subtitle:update", wrapper);
      listenerMap.delete(callback);
    }
  },

  // 弹幕 IPC API
  danmakuPush: (payload: unknown) =>
    ipcRenderer.send("danmaku:push", payload),
  danmakuUpdate: (payload: unknown) =>
    ipcRenderer.send("danmaku:update", payload),
  danmakuCorrect: (payload: unknown) =>
    ipcRenderer.send("danmaku:correct", payload),
  danmakuEvict: (payload: unknown) =>
    ipcRenderer.send("danmaku:evict", payload),
  danmakuClear: () =>
    ipcRenderer.send("danmaku:clear"),

  onDanmakuPush: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("danmaku:push", wrapper);
  },
  onDanmakuUpdate: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("danmaku:update", wrapper);
  },
  onDanmakuCorrect: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("danmaku:correct", wrapper);
  },
  onDanmakuEvict: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("danmaku:evict", wrapper);
  },
  onDanmakuClear: (callback: () => void) => {
    const wrapper = () => callback();
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("danmaku:clear", wrapper);
  },

  // 弹幕监听器移除（cleanup）
  removeDanmakuPushListener: (callback: (payload: unknown) => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("danmaku:push", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },
  removeDanmakuUpdateListener: (callback: (payload: unknown) => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("danmaku:update", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },
  removeDanmakuCorrectListener: (callback: (payload: unknown) => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("danmaku:correct", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },
  removeDanmakuEvictListener: (callback: (payload: unknown) => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("danmaku:evict", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },
  removeDanmakuClearListener: (callback: () => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("danmaku:clear", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },

  // Click-through 切换
  setOverlayClickThrough: (enabled: boolean) =>
    ipcRenderer.send("overlay:setClickThrough", enabled),
  // 叠加窗口大小控制
  resizeOverlay: (width: number, height: number) =>
    ipcRenderer.send("overlay:resize", width, height),
  // 叠加窗口按需启停
  openOverlay: (widthPercent?: number) =>
    ipcRenderer.send("overlay:open", widthPercent),
  closeOverlay: () =>
    ipcRenderer.send("overlay:close"),

  // 样式同步：控制面板 → overlay 弹幕字幕
  applyOverlayStyle: (payload: unknown) =>
    ipcRenderer.send("overlay:applyStyle", payload),
  onOverlayApplyStyle: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("overlay:applyStyle", wrapper);
  },
  removeOverlayApplyStyleListener: (callback: (payload: unknown) => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("overlay:applyStyle", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },
});
