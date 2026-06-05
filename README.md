# FloatTrans AI

> 极简桌面双语同传字幕悬浮助手 Demo

FloatTrans AI 不是传统播放器——它是一个**系统级透明悬浮窗**，在屏幕底部以置顶方式显示双语字幕。用户观看会议、网课或技术分享时，字幕浮在所有窗口之上，不遮挡、不抢焦点、不干扰操作。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| 桌面悬浮字幕 | 透明、无边框、永远置顶、鼠标穿透、屏幕底部居中 |
| 双语独立开关 | 英文/中文可分别开启或关闭 |
| 字幕样式调节 | 透明度、字号（16-64px）、颜色实时可调 |
| 上下文智能修正 | 根据后文语义自动修正前文识别/翻译错误 |
| 修正记录追溯 | 控制面板展示每次修正的内容和原因 |
| 演示/实时双模式 | Demo 模式用预置字幕时间轴；实时模式支持 WebSocket 音频推送 |

---

## 快速开始

```bash
# 1. 安装所有依赖（前后端）
npm run install:all

# 2. 启动 Vite 开发服务器（前端）
npm run dev

# 3. 另一个终端：启动 Electron
npm run dev:electron
```

点击控制面板的 **「开始播放」**，桌面底部即出现双语字幕。

> **实时模式**需要先启动后端：`npm run dev:backend`（默认 ws://localhost:3001），然后点击「🎤 开始监听」。

---

## 项目结构

```
floattrans-ai/
├── electron/                     # 前端 (React + Electron)
│   ├── src/
│   │   ├── compose.ts                # 组合根（依赖注入装配）
│   │   ├── components/
│   │   │   ├── ControlPanel.tsx      # 控制面板（演示/实时双模式）
│   │   │   ├── OverlaySubtitle.tsx   # 悬浮字幕渲染
│   │   │   └── CorrectionLog.tsx     # 修正记录条目
│   │   ├── engine/
│   │   │   └── SubtitleEngine.ts     # 核心引擎（纯逻辑，可独立测试）
│   │   ├── modules/
│   │   │   ├── audio/               # 音频采集模块
│   │   │   │   ├── domain/          # IAudioCaptureService 接口
│   │   │   │   └── infrastructure/  # SystemAudioCapture 实现
│   │   │   ├── session/             # 会话管理模块
│   │   │   │   ├── domain/          # Session 实体 + IWebSocketClient 接口
│   │   │   │   ├── application/     # StartSessionUseCase
│   │   │   │   └── infrastructure/  # WebSocketClient 实现
│   │   │   └── subtitle/            # 字幕处理模块
│   │   │       ├── domain/          # 字幕数据源接口
│   │   │       └── application/     # ProcessSubtitleUseCase
│   │   ├── data/                    # 演示数据
│   │   └── types/                   # 前端类型定义 SSOT
│   ├── main.ts                      # Electron 主进程（双窗口 + IPC）
│   └── preload.ts                   # contextBridge 安全桥接
├── nodejs/                      # 后端 (TypeScript + WebSocket)
│   └── server/
│       ├── compose.ts               # 组合根
│       ├── config.ts                # 环境配置（含运行时校验）
│       ├── index.ts                 # WebSocket 服务入口
│       ├── modules/
│       │   ├── pipeline/            # 音频管道（ASR → 纠错 → 翻译）
│       │   │   ├── domain/          # AudioPipeline + IASRService + ITranslationService
│       │   │   ├── application/     # AudioPipelineUseCase
│       │   │   └── infrastructure/  # AzureASRService + GPT4MiniTranslationService
│       │   └── session/             # 会话聚合根 + 仓储
│       └── presentation/
│           └── wsHandler.ts         # WebSocket 消息路由
├── shared/                      # 前后端共享
│   ├── domain/
│   │   └── ContextEntry.value-object.ts
│   ├── errors/
│   │   └── AppError.ts              # 异常体系基类 + 7 个子类
│   └── types/
│       └── websocket.ts             # WebSocket 协议 DTO
├── package.json                 # monorepo 根（脚本路由）
└── README.md
```

---

## Demo 说明

**当前 Demo 模式使用预置字幕时间轴模拟实时音频流**，不依赖真实 ASR、翻译 API 或后端服务。

演示重点：
- 实时字幕状态管理与播放
- 双语字幕独立切换
- 字幕样式个性化（透明度、字号、颜色）
- 上下文驱动的历史字幕修正（如 `rest → Rust`）
- 修正记录完整追溯

**实时模式**（需要先启动 nodejs 后端）：
- WebSocket 连接管理（指数退避自动重连）
- 系统音频采集 → 二进制 PCM 帧推送
- ASR 语音识别 → 上下文纠错引擎 → LLM 翻译
- 实时字幕流式渲染

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron |
| 前端 UI | React 18 + TypeScript (strict) |
| 构建 | Vite |
| 后端运行时 | Node.js + tsx |
| WebSocket | ws |
| 架构模式 | 清洁架构（domain → application → infrastructure ← presentation） |
| 样式 | CSS（无框架依赖） |
| 测试 | Vitest |

---

## 答辩文案

> FloatTrans AI 是一个极简桌面双语同传字幕助手。我们没有把它做成复杂播放器，而是设计成系统级悬浮字幕工具。用户只需要点击播放，字幕就会以透明置顶窗口的形式显示在屏幕底部，不干扰用户观看会议、网课或技术分享。
>
> 当前 Demo 使用预置字幕时间轴模拟实时音频流，重点展示字幕状态管理、双语控制、样式个性化和上下文修正能力。核心引擎 SubtitleEngine 是纯 TypeScript 类，与 React 和 Electron 完全解耦，可在不启动桌面的情况下独立测试。
>
> v2.0 升级为前后端分离的清洁架构，实时模式支持 WebSocket 音频推送、ASR 语音识别和 LLM 翻译管道，可无缝接入 Azure Speech / GPT-4o-mini 等真实服务。
