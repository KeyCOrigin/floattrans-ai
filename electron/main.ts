import { app, BrowserWindow, screen, ipcMain, session } from "electron";
import path from "path";

let controlWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    title: "FloatTrans AI",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    controlWindow.loadURL("http://localhost:5173/index.html");
  } else {
    controlWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  controlWindow.on("closed", () => {
    controlWindow = null;
  });
}

function createOverlayWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 180,
    x: Math.floor((width - 1200) / 2),
    y: height - 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true);

  if (isDev) {
    overlayWindow.loadURL("http://localhost:5173/overlay.html");
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../dist/overlay.html"));
  }
}

// 权限处理：允许 media 音频权限（麦克风/虚拟声卡采集必需）
// IPC 转发：控制窗口 → 悬浮字幕窗口
ipcMain.on("subtitle:update", (_event, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("subtitle:update", payload);
  }
});

app.whenReady().then(() => {
  // 媒体权限：允许麦克风/虚拟声卡采集
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ["media"];
      callback(allowed.includes(permission));
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => {
      return permission === "media";
    },
  );

  createControlWindow();
  createOverlayWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
      createOverlayWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
