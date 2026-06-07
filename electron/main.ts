import { app, BrowserWindow, screen, ipcMain, session } from "electron";
import path from "path";

let controlWindow: BrowserWindow | null = null;
let viewerWindow: BrowserWindow | null = null;

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

function createViewerWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const viewerW = 500;
  const viewerH = 700;

  viewerWindow = new BrowserWindow({
    width: viewerW,
    height: viewerH,
    minWidth: 320,
    minHeight: 300,
    x: Math.floor((width - viewerW) / 2),
    y: Math.floor((height - viewerH) / 2),
    frame: false,
    transparent: false,
    backgroundColor: "#1a1a1a",
    alwaysOnTop: false,
    resizable: true,
    skipTaskbar: false,
    title: "FloatTrans — 实时同传文档",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    viewerWindow.loadURL("http://localhost:5173/overlay.html");
  } else {
    viewerWindow.loadFile(path.join(__dirname, "../dist/overlay.html"));
  }

  viewerWindow.on("closed", () => {
    viewerWindow = null;
  });

  // 页面加载完成后补发积压的样式消息
  viewerWindow.webContents.on("did-finish-load", () => {
    if (viewerWindow && !viewerWindow.isDestroyed() && pendingStyle !== null) {
      viewerWindow.webContents.send("overlay:applyStyle", pendingStyle);
    }
  });
}

/** 缓存最近一次样式，在 overlay 页面加载完成后补发 */
let pendingStyle: unknown = null;

// === Markdown 文档流 IPC 转发（控制面板 → 阅读器窗口）===
ipcMain.on("document:content", (_event, payload) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send("document:content", payload);
  }
});

ipcMain.on("document:clear", () => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send("document:clear");
  }
});

// 样式同步：控制面板 → 阅读器窗口
ipcMain.on("overlay:applyStyle", (_event, payload) => {
  pendingStyle = payload;
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send("overlay:applyStyle", payload);
  }
});

// 阅读器窗口按需启停
ipcMain.on("viewer:open", () => {
  if (!viewerWindow || viewerWindow.isDestroyed()) {
    createViewerWindow();
  }
});

ipcMain.on("viewer:close", () => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.close();
    viewerWindow = null;
    pendingStyle = null;
  }
});

app.whenReady().then(() => {
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
