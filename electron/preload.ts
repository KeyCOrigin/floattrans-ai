import { contextBridge, ipcRenderer } from "electron";

const listenerMap = new WeakMap<(...args: unknown[]) => void, (...args: unknown[]) => void>();

contextBridge.exposeInMainWorld("electronAPI", {
  // === 文档流 IPC（控制面板 → overlay） ===
  sendDocumentContent: (payload: unknown) =>
    ipcRenderer.send("document:content", payload),
  sendDocumentClear: () =>
    ipcRenderer.send("document:clear"),

  // === 文档流监听（overlay 接收） ===
  onDocumentContent: (callback: (payload: unknown) => void) => {
    const wrapper = (_event: unknown, payload: unknown) => callback(payload);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("document:content", wrapper);
  },
  onDocumentClear: (callback: () => void) => {
    const wrapper = () => callback();
    listenerMap.set(callback, wrapper);
    ipcRenderer.on("document:clear", wrapper);
  },

  removeDocumentContentListener: (callback: (payload: unknown) => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("document:content", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },
  removeDocumentClearListener: (callback: () => void) => {
    const w = listenerMap.get(callback as (...args: unknown[]) => void);
    if (w) { ipcRenderer.removeListener("document:clear", w); listenerMap.delete(callback as (...args: unknown[]) => void); }
  },

  // === 悬浮窗控制 ===
  openOverlay: () =>
    ipcRenderer.send("viewer:open"),
  closeOverlay: () =>
    ipcRenderer.send("viewer:close"),

  // === 样式同步 ===
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
