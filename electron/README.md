# FloatTrans AI — Electron 前端

> 项目概述、核心功能和完整结构请见[根 README](../README.md)。

---

## 快速开始（前端）

```bash
# 在此目录下安装前端依赖
npm install

# 终端一：启动 Vite 开发服务器
npm run dev

# 终端二：编译 Electron 主进程 + 启动桌面应用
npm run electron:dev
```

---

## Electron 架构

### 双窗口设计

| 窗口 | 文件 | 特征 |
|------|------|------|
| 控制窗口 | `main.ts` → `ControlPanel.tsx` | 380×560, 常规窗口 |
| 悬浮字幕窗口 | `main.ts` → `OverlaySubtitle.tsx` | 1200×180, transparent, alwaysOnTop, frame:false, skipTaskbar, focusable:false |

IPC 通道：`subtitle:update`（控制窗口 → 主进程 → 悬浮窗口）

### 前端清洁架构

```
electron/src/
├── compose.ts                          # 组合根（唯一 new 点）
├── engine/
│   └── SubtitleEngine.ts               # 纯逻辑核心（零框架依赖）
├── components/
│   ├── ControlPanel.tsx                # 演示/实时双模式控制
│   ├── OverlaySubtitle.tsx             # 悬浮字幕渲染
│   └── CorrectionLog.tsx               # 修正记录条目
├── modules/
│   ├── audio/
│   │   ├── domain/IAudioCaptureService.ts    # 音频采集端口
│   │   └── infrastructure/SystemAudioCapture.ts  # 系统音频实现
│   ├── session/
│   │   ├── domain/Session.entity.ts          # 会话实体（状态机）
│   │   ├── domain/IWebSocketClient.port.ts   # WebSocket 端口
│   │   ├── application/StartSessionUseCase.ts # 启动会话用例
│   │   └── infrastructure/WebSocketClient.ts # WebSocket 实现
│   └── subtitle/
│       ├── domain/                           # 字幕数据源接口
│       └── application/ProcessSubtitleUseCase.ts
├── data/
│   ├── demoSegments.ts                 # 预置字幕时间轴
│   └── demoCorrections.ts              # 预置修正事件
└── types/
    └── subtitle.ts                     # 字幕类型 SSOT
```

---

## SubtitleEngine 核心设计

纯 TypeScript 类，不依赖 React、Electron 或任何浏览器 API。通过 `tick(deltaSeconds)` 驱动时间轴推进，`start(onTick)` 注册回调接收每一帧的字幕和修正事件。

关键能力：
- 时间轴驱动字幕切换（`#findCurrentSegment()`）
- 上下文修正自动触发（`#applyDueCorrections()`，根据 `triggerAt` + `applied` 标志）
- 二次播放完整恢复（`stop()` 通过 `#originalSegments` 还原被修正的文本）
- 可注入 ID 生成器（测试可控）

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron |
| UI | React 18 + TypeScript (strict) |
| 构建 | Vite |
| 样式 | CSS（无框架依赖） |
| 测试 | Vitest |
| 音频采集 | Web Audio API (ScriptProcessorNode) |
