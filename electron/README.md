# FloatTrans AI — Electron 前端

> 完整项目概述、架构设计详见[根 README](../README.md)。

---

## 快速开始

```bash
# 安装依赖
npm install

# 终端一：Vite 开发服务器
npm run dev                  # → http://localhost:5173

# 终端二：编译 Electron 主进程 + 启动桌面应用
npm run electron:dev

# 同时启动 Vite + Electron（一键方案）
npm run dev:all
```

> 实时同传模式需要先启动后端：在项目根执行 `npm run dev:backend`。

---

## 窗口架构

### 双窗口设计

| 窗口 | 入口 | 组件 | 特征 |
|------|------|------|------|
| 控制面板 | `index.html` → `main.tsx` | `ControlPanel.tsx` | 380×560，不可缩放，设备选择/启停/样式调节 |
| 文档窗口 | `overlay.html` → `overlay.tsx` | `TranscriptOverlay.tsx` | 500×700，可缩放拖拽，Markdown 实时渲染 + 自动滚底 |

### IPC 通道

控制面板通过 Electron 主进程（`main.ts`）将 Markdown 内容和样式设置转发到文档窗口：

```
ControlPanel ──IPC──▶ main.ts ──webContents.send──▶ TranscriptOverlay
```

| 通道 | 方向 | 说明 |
|------|------|------|
| `viewer:open` / `viewer:close` | CP → main | 打开/关闭文档窗口 |
| `document:content` | CP → main → DO | 推送 Markdown（含版本号） |
| `document:clear` | CP → main → DO | 清空文档 |
| `overlay:applyStyle` | CP → main → DO | 透明度/字号/颜色 |

---

## 清洁架构

```
electron/src/
├── compose.ts                            # 组合根（唯一 new 的地方）
├── main.tsx                              # React 入口 — 控制面板
├── overlay.tsx                           # React 入口 — 文档窗口
├── components/
│   ├── ControlPanel.tsx                  # 设备选择 / 启停 / 样式
│   └── TranscriptOverlay.tsx             # Markdown 渲染 + 自动滚底
├── modules/
│   ├── audio/
│   │   ├── domain/
│   │   │   ├── IAudioCaptureService.ts   # 音频采集接口
│   │   │   ├── AudioChunk.value-object.ts
│   │   │   └── AudioDevice.value-object.ts
│   │   └── infrastructure/
│   │       └── BrowserAudioCapture.ts    # Web Audio API 实现
│   └── session/
│       ├── domain/
│       │   ├── Session.entity.ts         # 会话实体（状态机）
│       │   ├── SessionState.value-object.ts
│       │   ├── IWebSocketClient.port.ts  # WebSocket 接口
│       │   └── __tests__/Session.test.ts
│       ├── application/
│       │   └── StartSessionUseCase.ts    # 启动/停止会话
│       └── infrastructure/
│           └── WebSocketClient.ts        # 指数退避重连实现
├── styles/
│   ├── control.css
│   └── overlay.css
└── types/
    ├── overlay.ts                         # IPC 样式载荷
    └── subtitle.ts                        # WebSocket 消息类型
```

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron 41 |
| UI | React 19 + TypeScript 5.8 (strict) |
| Markdown 渲染 | react-markdown 10 + remark-gfm 4 |
| 构建 | Vite 6 |
| WebSocket | 原生 WebSocket（指数退避自动重连） |
| 音频采集 | Web Audio API (getUserMedia → MediaStream) |
| 测试 | Vitest 3 |
