import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  updateSubtitle: (payload: unknown) =>
    ipcRenderer.send("subtitle:update", payload),

  onSubtitleUpdate: (callback: (payload: unknown) => void) => {
    ipcRenderer.on("subtitle:update", (_event, payload) => callback(payload));
  },

  removeSubtitleUpdateListener: (callback: (payload: unknown) => void) => {
    ipcRenderer.removeListener("subtitle:update", callback);
  },
});
