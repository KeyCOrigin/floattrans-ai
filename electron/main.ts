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

function createOverlayWindow(widthPercent: number = 60): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const overlayW = Math.round(width * widthPercent / 100);
  const overlayH = 680;

  overlayWindow = new BrowserWindow({
    width: overlayW,
    height: overlayH,
    minWidth: 400,
    minHeight: 200,
    x: Math.floor((width - overlayW) / 2),
    y: height - overlayH - 30,
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

// 叠加窗口大小控制（width/height=0 表示保持当前值）
ipcMain.on("overlay:resize", (_event, width: number, height: number) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const [currentW, currentH] = overlayWindow.getSize();
    const w = width > 0 ? Math.round(width) : currentW;
    const h = height > 0 ? Math.round(height) : currentH;
    overlayWindow.setSize(w, h);
  }
});

// 样式同步：控制面板 → 叠加窗口
ipcMain.on("overlay:applyStyle", (_event, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:applyStyle", payload);
  }
});

// 叠加窗口按需启停：播放时创建（传入当前宽度百分比），停止时销毁
ipcMain.on("overlay:open", (_event, widthPercent?: number) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow(widthPercent);
  }
});

ipcMain.on("overlay:close", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
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
            "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self' data: https://fonts.gstatic.com",
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
  // overlay 窗口按需创建：播放时由 ControlPanel 通过 overlay:open IPC 触发

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
