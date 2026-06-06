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
    width: 800,
    height: 400,
    minWidth: 400,
    minHeight: 100,
    x: Math.floor((width - 800) / 2),
    y: height - 440,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 崩溃诊断
  overlayWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[overlay] render-process-gone:", details.reason, details.exitCode);
  });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

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

// 弹幕 IPC 转发
const DANMAKU_CHANNELS = [
  "danmaku:push",
  "danmaku:update",
  "danmaku:correct",
  "danmaku:evict",
  "danmaku:clear",
] as const;

for (const channel of DANMAKU_CHANNELS) {
  ipcMain.on(channel, (_event, payload) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(channel, payload);
    }
  });
}

// Click-through 切换：overlay 窗口鼠标穿透开关
ipcMain.on("overlay:setClickThrough", (_event, enabled: boolean) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(enabled);
  }
});

// 叠加窗口大小控制
ipcMain.on("overlay:resize", (_event, width: number, height: number) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setSize(Math.round(width), Math.round(height));
  }
});

// 样式同步：控制面板 → 叠加窗口
ipcMain.on("overlay:applyStyle", (_event, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:applyStyle", payload);
  }
});

app.whenReady().then(() => {
  // CSP：通过 session API 设置才能被 Electron 安全系统识别，消除控制台警告
  if (isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self' data:",
          ],
        },
      });
    });
  }

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
