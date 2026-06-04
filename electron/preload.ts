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
});
