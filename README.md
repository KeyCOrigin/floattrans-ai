# FloatTrans AI

> 极简桌面双语同传字幕悬浮助手

FloatTrans AI 是一个**系统级透明悬浮窗**，在屏幕底部以置顶方式显示双语字幕。用户观看会议、网课或技术分享时，字幕浮在所有窗口之上——不遮挡、不抢焦点、不干扰操作。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| 桌面悬浮字幕 | 透明、无边框、永远置顶、鼠标穿透、屏幕底部居中 |
| 双语独立开关 | 英文/中文可分别开启或关闭 |
| 字幕样式调节 | 透明度、字号（16-64px）、颜色实时可调 |
| 实时语音识别 | 系统音频采集 → ASR 流式识别（Azure / 讯飞） |
| 快速机器翻译 | 逐句增量 NMT 翻译（百度），带队列去重与陈旧守卫 |
| 上下文智能修正 | LLM（智谱 GLM-4-flash）通读全文，修正翻译 + 合并增量行 |
| 增量合并去重 | 自动检测 ASR 同句渐进修正，隐藏旧行不删除 |
| 修正记录持久化 | 修正后的文档实时写入 `.md` 文件，完整追溯 |

---

## 快速开始

```bash
# 1. 安装所有依赖
npm run install:all

# 2. 配置环境变量
cp nodejs/.env.example nodejs/.env
# 编辑 nodejs/.env，填入 API Key（ASR、NMT、LLM）

# 3. 启动后端（WebSocket 服务）
npm run dev:backend      # → ws://localhost:3001

# 4. 前端：启动 Vite 开发服务器
npm run dev

# 5. 前端：启动 Electron 悬浮窗
npm run dev:electron
```

点击控制面板的 **「开始播放」** 使用 Demo 模式；点击 **「🎤 开始监听」** 进入实时同传模式。

---

## 技术栈

### 前端（Electron + React）

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron |
| UI 框架 | React 18 + TypeScript (strict) |
| 构建工具 | Vite |
| WebSocket 客户端 | 原生 WebSocket（指数退避重连） |
| 音频采集 | Browser AudioContext（系统音频捕获） |
| 样式 | CSS（无第三方 UI 库） |

### 后端（Node.js + WebSocket）

| 层 | 选型 |
|----|------|
| 运行时 | Node.js + tsx |
| WebSocket | ws |
| ASR 语音识别 | Azure Speech / 讯飞语音（可配置） |
| NMT 快速翻译 | 百度翻译（NmtScheduler 队列去重） |
| LLM 智能修正 | 智谱 GLM-4-flash（可切换 OpenAI / DeepSeek / 通义千问 / 星火） |
| 持久化 | Markdown 文件（按 session 存储） |

### 架构模式

```
前端 (Electron)                    后端 (Node.js)
┌─────────────────┐               ┌─────────────────────────────┐
│  ControlPanel   │               │         wsHandler           │
│  TranscriptOv.  │               │   (WebSocket 消息路由)       │
│  AudioCapture   │─── PCM ──────▶│           ↓                 │
│  WebSocketClt   │               │     AudioPipeline            │
└─────────────────┘               │  ASR → LiveDocument → NMT    │
                                  │       → LLM Correction       │
                                  │            ↓                 │
                                  │    sessions/*.md (持久化)     │
                                  └─────────────────────────────┘
```

前后端均遵循**清洁架构（Clean Architecture）**：

```
presentation / IPC   ←──   application / domain   ←──   infrastructure
   (消息路由)               (业务逻辑/实体)                (外部服务适配器)
```

- `domain/` 纯 TypeScript 类，零外部依赖，可独立测试
- `infrastructure/` 实现 domain 接口（DIP 依赖反转）
- `compose.ts` 是唯一 `new` 具体实现的地方

---

## 项目结构

```
floattrans-ai/
├── electron/                          # 前端 (React + Electron)
│   ├── main.ts                        # Electron 主进程（透明窗口 + IPC）
│   ├── preload.ts                     # contextBridge 安全桥接
│   ├── src/
│   │   ├── main.tsx                   # React 入口（控制面板）
│   │   ├── overlay.tsx                # React 入口（悬浮字幕窗口）
│   │   ├── compose.ts                 # 组合根（依赖注入装配）
│   │   ├── components/
│   │   │   ├── ControlPanel.tsx       # 控制面板（Demo/实时双模式）
│   │   │   └── TranscriptOverlay.tsx  # 悬浮字幕渲染（逐行入场/离场动画）
│   │   ├── modules/
│   │   │   ├── audio/
│   │   │   │   ├── domain/           # IAudioCaptureService 接口
│   │   │   │   └── infrastructure/   # BrowserAudioCapture 实现
│   │   │   └── session/
│   │   │       ├── domain/           # Session 实体 + IWebSocketClient 接口
│   │   │       ├── application/      # StartSessionUseCase
│   │   │       └── infrastructure/   # WebSocketClient 实现
│   │   └── types/                    # 前端类型定义
│   └── vite.config.ts
│
├── nodejs/                            # 后端 (TypeScript + WebSocket)
│   └── server/
│       ├── index.ts                   # WebSocket 服务入口
│       ├── compose.ts                 # 组合根（唯一 new 的地方）
│       ├── config.ts                  # 环境配置（运行时校验 + 多供应商模板）
│       ├── modules/
│       │   ├── pipeline/
│       │   │   ├── domain/
│       │   │   │   ├── AudioPipeline.service.ts      # 管道核心（ASR → Doc → NMT → LLM）
│       │   │   │   ├── LiveDocument.entity.ts         # 转录文档聚合根
│       │   │   │   ├── LiveLine.entity.ts             # 稳定身份行（UUID + 三段版本号）
│       │   │   │   ├── MergeGroup.value-object.ts     # 合并组值对象
│       │   │   │   ├── MergeGroupManager.service.ts   # 合并组管理器
│       │   │   │   ├── TranscriptDiffEngine.service.ts # LLM diff + 合并检测
│       │   │   │   ├── LiveDocumentRenderer.service.ts # Markdown 渲染
│       │   │   │   ├── IASRService.port.ts            # ASR 服务接口
│       │   │   │   ├── INMTService.port.ts            # NMT 服务接口
│       │   │   │   ├── ICorrectionService.port.ts     # LLM 修正接口
│       │   │   │   ├── ITranscriptRepository.port.ts  # 转录仓储接口
│       │   │   │   └── __tests__/                     # 49 个单元测试
│       │   │   ├── application/
│       │   │   │   └── AudioPipelineUseCase.ts
│       │   │   └── infrastructure/
│       │   │       ├── AzureASRService.ts             # Azure 语音识别适配器
│       │   │       ├── IFlytekASRService.ts           # 讯飞语音识别适配器
│       │   │       ├── BaiduNMTService.ts             # 百度翻译适配器
│       │   │       ├── NmtSchedulerService.ts         # NMT 调度器（队列去重/并发/超时）
│       │   │       ├── LLMCorrectionService.ts        # LLM 修正适配器（多供应商）
│       │   │       └── MarkdownFileRepository.ts      # Markdown 文件持久化
│       │   ├── session/
│       │   │   ├── domain/
│       │   │   │   ├── Session.entity.ts
│       │   │   │   ├── ISessionRepository.port.ts
│       │   │   │   └── __tests__/
│       │   │   └── infrastructure/
│       │   │       └── InMemorySessionRepository.ts
│       │   └── presentation/
│       │       └── wsHandler.ts                       # WebSocket 消息路由
│       └── sessions/                                  # 转录文档持久化目录（*.md）
│
├── shared/                             # 前后端共享
│   ├── domain/
│   │   └── ContextEntry.value-object.ts
│   ├── errors/
│   │   └── AppError.ts                # 异常体系基类 + 子类
│   └── types/
│       └── websocket.ts               # WebSocket 协议 DTO
│
├── package.json                        # monorepo 根（脚本路由）
└── README.md
```

---

## 管道架构详解

### 音频管道数据流

```
系统音频（PCM）
    │
    ▼
┌─────────────────┐
│   ASR 语音识别   │  Azure Speech / 讯飞
│  (partial/final) │  流式推送 intermediate + final 结果
└───────┬─────────┘
        │
        ▼  逐句 final 文本
┌─────────────────┐
│  LiveDocument   │  appendOrRefine() → 稳定 lineId (UUID)
│    (聚合根)      │  三段版本号：sourceVersion / nmtVersion / refinedVersion
└───────┬─────────┘
        │
        ▼  { lineId, sourceVersion }
┌─────────────────┐
│   NMT 快速翻译   │  百度翻译 (NmtScheduler 队列去重)
│   (fire&forget) │  陈旧守卫：sourceVersion 不匹配 → 丢弃
└───────┬─────────┘
        │
        ▼  每 3 句触发
┌─────────────────┐
│  LLM 全文修正    │  智谱 GLM-4-flash（多供应商可切换）
│                  │  ① diff 中文修正 → applyRefineResult
│                  │  ② detectMerges → MergeGroup 隐藏增量行
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│  toMarkdown()   │  可见行：**[N] EN:** / **[N] ZH:**
│  + 文件持久化    │  隐藏行：<!-- merged: ... --> HTML 注释保留
└───────┬─────────┘
        │
        ▼  WebSocket 推送
┌─────────────────┐
│  前端悬浮字幕    │  TranscriptOverlay 逐行渲染
│   (Electron)    │  入场/离场动画，双语独立开关
└─────────────────┘
```

### LiveLine 稳定身份机制（Phase 1）

ASR 实时转写中，同一句话会被多次修正（增量完善），例如：

```
"I hear" → "I hear birds" → "I hear birds chirping"
```

传统方案用行号索引定位，行号在合并/隐藏后频繁变化。**LiveLine** 使用 UUID 作为稳定身份：

| 字段 | 说明 |
|------|------|
| `id` | UUID，自创建起不变 |
| `sourceVersion` | ASR 文本每次修正 +1 |
| `nmtVersion` | NMT 翻译版本 |
| `refinedVersion` | LLM 修正版本 |

`appendOrRefine()` 在所有行（含已隐藏行）中反序搜索前缀匹配，同一句返回相同 `lineId`。NMT 回调携带 `sourceVersion` 做陈旧检测——若 ASR 已更新了该句，旧翻译结果自动丢弃。

### MergeGroup 合并去重（Phase 2）

LLM 检测到连续增量行后，不删除、而是**隐藏**旧版本：

- 隐藏行在 `toMarkdown()` 中输出为 HTML 注释 `<!-- merged: ... -->`，完整保留原文
- ASR 继续修正已隐藏行时，`MergeGroupManager` 检测状态过期（stale），自动丢弃合并组，恢复被隐藏行
- 被合并的代表行保持可见，携带最完整的英文和中文翻译

---

## 环境变量配置

```env
# ── ASR 语音识别 ──
ASR_PROVIDER=azure            # azure | iflytek
AZURE_SPEECH_KEY=             # Azure 订阅密钥
AZURE_SPEECH_REGION=eastasia  # Azure 区域

# ── NMT 快速翻译 ──
NMT_PROVIDER=baidu            # baidu | placeholder
BAIDU_APP_ID=                 # 百度翻译 APP ID
BAIDU_API_KEY=                # 百度翻译 API Key

# ── LLM 智能修正 ──
TRANSLATION_PROVIDER=zhipu    # openai | deepseek | siliconflow | bailian | zhipu | spark
ZHIPU_API_KEY=                # 智谱 API Key
# OPENAI_API_KEY=             # 按 provider 选择对应环境变量
# DEEPSEEK_API_KEY=
# BAILIAN_API_KEY=
# SPARK_API_KEY=

# ── 服务配置 ──
SERVER_PORT=3001
```

LLM 供应商模板内置于 `config.ts`，切换 `TRANSLATION_PROVIDER` 即可换模型，无需改代码。

---

## Demo 模式

Demo 模式使用**预置字幕时间轴**模拟实时音频流，不依赖真实 ASR、翻译 API 或后端服务。

演示重点：
- 实时字幕状态管理与播放
- 双语字幕独立切换
- 字幕样式个性化（透明度、字号、颜色）
- 上下文驱动的历史字幕修正
- 修正记录完整追溯

实时模式需要启动后端 `npm run dev:backend`，配置 API Key 后点击「🎤 开始监听」即可使用。

---

## 测试

```bash
# 运行全部 49 个测试
npm test                          # 或在 nodejs 目录下 npx vitest run

# 仅编译检查
cd nodejs && npx tsc --noEmit
```

测试覆盖：
- `LiveDocument` — 文档聚合根（追加、修正、隐藏、恢复、Markdown 输出）
- `LiveLine` — 稳定身份行（三段版本号、NMT 陈旧守卫）
- `TranscriptDiffEngine` — LLM 结果 diff + 合并检测（精确匹配 + 前缀回退）
- `MergeGroupManager` — 合并组生命周期（创建、脏标记、过期丢弃）
- `Session` — 会话实体状态机

---

## 答译文案

> FloatTrans AI 是一个极简桌面双语同传字幕助手。我们没有把它做成复杂播放器，而是设计成系统级悬浮字幕工具。用户只需要点击播放，字幕就会以透明置顶窗口的形式显示在屏幕底部，不干扰用户观看会议、网课或技术分享。
>
> 后端管道采用清洁架构：ASR 语音识别 → LiveDocument 稳定身份聚合根 → NMT 快速翻译（含陈旧守卫）→ LLM 全文智能修正。LiveLine 的 UUID 稳定身份解决了实时转写中同一句话增量修正的身份漂移问题；MergeGroup 合并去重在不删除原始行的前提下隐藏增量版本，保证数据完整性。
>
> v2.0 升级为前后端分离架构：前端 Electron + React 18 + Vite，后端 Node.js + WebSocket + tsx，支持 Azure/讯飞 ASR、百度翻译 NMT、智谱/OpenAI 等多家 LLM 供应商一键切换。
