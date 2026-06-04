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

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 终端一：启动 Vite 开发服务器
npm run dev

# 3. 终端二：启动 Electron
npm run electron:dev
```

点击控制面板的 **「开始播放」**，桌面底部即出现双语字幕。

---

## 项目结构

```
floattrans-ai/
├── electron/
│   ├── main.ts          # Electron 主进程：双窗口 + IPC 转发
│   └── preload.ts       # contextBridge 安全桥接
├── src/
│   ├── engine/
│   │   └── SubtitleEngine.ts   # 核心引擎（纯逻辑，可脱离 Electron 测试）
│   ├── components/
│   │   ├── ControlPanel.tsx     # 控制面板
│   │   ├── OverlaySubtitle.tsx  # 悬浮字幕渲染
│   │   └── CorrectionLog.tsx    # 修正记录条目
│   ├── data/
│   │   ├── demoSegments.ts      # 预置字幕时间轴
│   │   └── demoCorrections.ts   # 预置修正事件
│   └── types/
│       └── subtitle.ts          # 类型定义 SSOT
├── package.json
└── README.md
```

---

## Demo 说明

**当前版本使用预置字幕时间轴模拟实时音频流**，不依赖真实 ASR、翻译 API 或后端服务。

演示重点：
- 实时字幕状态管理与播放
- 双语字幕独立切换
- 字幕样式个性化（透明度、字号、颜色）
- 上下文驱动的历史字幕修正（如 `rest → Rust`）

**未来可扩展**：
- 接入真实 ASR（Azure Speech / Whisper）
- 接入实时翻译模型（GPT-4o-mini）
- 接入系统音频采集（loopback）
- 支持 SRT / VTT 字幕文件导入
- 适配会议、网课、直播等场景

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron |
| UI | React 18 + TypeScript (strict) |
| 构建 | Vite |
| 样式 | CSS（无框架依赖） |
| 数据 | 预置时间轴（`demoSegments.ts`） |

---

## 答辩文案

> FloatTrans AI 是一个极简桌面双语同传字幕助手。我们没有把它做成复杂播放器，而是设计成系统级悬浮字幕工具。用户只需要点击播放，字幕就会以透明置顶窗口的形式显示在屏幕底部，不干扰用户观看会议、网课或技术分享。
>
> 当前 Demo 使用预置字幕时间轴模拟实时音频流，重点展示字幕状态管理、双语控制、样式个性化和上下文修正能力。核心引擎 SubtitleEngine 是纯 TypeScript 类，与 React 和 Electron 完全解耦，可在不启动桌面的情况下独立测试。
>
> 该架构可无缝接入真实 ASR、实时翻译模型和系统音频采集能力。
