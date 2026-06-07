# FloatTrans AI

> 极简桌面实时同声传译文档助手 — 系统音频采集 → 语音识别 → 快速翻译 → LLM 智能修正

FloatTrans AI 由两个 Electron 窗口组成：**控制面板**（启停、设备选择、样式调节）和**实时文档窗口**（Markdown 双语字幕）。用户观看会议、网课或技术分享时，实时同传文档在独立窗口中流式更新，不遮挡主内容。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| 双窗口设计 | 控制面板（380×560）+ 实时文档窗口（可自由缩放、拖拽） |
| 系统音频采集 | 支持麦克风 / 系统音频两种模式，设备列表可刷新 |
| 实时语音识别 | Azure Speech / 讯飞，流式推送 partial + final 结果 |
| 快速机器翻译 | 百度翻译，NmtScheduler 队列去重 + 陈旧守卫 |
| LLM 智能修正 | 通读全文修正翻译 + 检测并合并 ASR 增量重复行 |
| 修正文档持久化 | 按 session 实时写入 `.md` 文件，完整可追溯 |
| 双向样式同步 | 控制面板调节透明度/字号/颜色，文档窗口实时生效 |

---

## 快速开始

```bash
# 1. 安装所有依赖
npm run install:all

# 2. 配置后端环境变量
cp nodejs/.env.example nodejs/.env
# 编辑 nodejs/.env，填入 API Key

# 3. 终端一：启动后端 WebSocket 服务
npm run dev:backend          # → ws://localhost:3001

# 4. 终端二：启动前端 Vite 开发服务器
npm run dev                  # → http://localhost:5173

# 5. 终端三：启动 Electron
npm run dev:electron
```

在控制面板选择输入设备后点击 **「🎤 开始监听」**，文档窗口即开始流式显示双语同传内容。

---

## 技术栈

### 前端（Electron + React）

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron 41 |
| UI | React 19 + TypeScript 5.8 (strict) |
| Markdown 渲染 | react-markdown + remark-gfm |
| 构建 | Vite 6 |
| WebSocket | 原生 WebSocket（指数退避重连） |
| 音频采集 | Web Audio API (MediaStream) |
| 测试 | Vitest 3 |

### 后端（Node.js + WebSocket）

| 层 | 选型 |
|----|------|
| 运行时 | Node.js + tsx |
| WebSocket | ws |
| ASR | Azure Speech / 讯飞（环境变量切换） |
| NMT | 百度翻译（NmtScheduler 调度器） |
| LLM | 智谱 GLM-4-flash（6 供应商可切换） |
| 持久化 | Markdown 文件（`sessions/*.md`） |
| 测试 | Vitest（49 用例） |

### LLM 供应商

| 供应商 | 模型 | 环境变量 |
|--------|------|---------|
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` |
| DeepSeek | deepseek-chat | `DEEPSEEK_API_KEY` |
| 硅基流动 | DeepSeek-V3 | `SILICONFLOW_API_KEY` |
| 阿里百炼 | qwen-plus | `BAILIAN_API_KEY` |
| 智谱 AI | glm-4-flash | `ZHIPU_API_KEY` |
| 讯飞星火 | spark-x2-flash | `SPARK_API_KEY` |

切换 `TRANSLATION_PROVIDER` 环境变量即可，无需改代码。

---

## 项目结构

```
floattrans-ai/
├── electron/                            # 前端 (Electron + React)
│   ├── main.ts                          # Electron 主进程（双窗口 + IPC 转发）
│   ├── preload.ts                       # contextBridge 安全桥接
│   ├── src/
│   │   ├── main.tsx                     # React 入口 — 控制面板
│   │   ├── overlay.tsx                  # React 入口 — 实时文档窗口
│   │   ├── compose.ts                   # 组合根（依赖注入装配）
│   │   ├── components/
│   │   │   ├── ControlPanel.tsx         # 控制面板（设备选择/启停/样式调节）
│   │   │   └── TranscriptOverlay.tsx    # 文档查看器（Markdown 渲染 + 自动滚底）
│   │   ├── modules/
│   │   │   ├── audio/
│   │   │   │   ├── domain/             # IAudioCaptureService 接口 + AudioChunk/AudioDevice VO
│   │   │   │   └── infrastructure/     # BrowserAudioCapture 实现
│   │   │   └── session/
│   │   │       ├── domain/             # Session 实体 + IWebSocketClient 接口
│   │   │       ├── application/        # StartSessionUseCase
│   │   │       └── infrastructure/     # WebSocketClient 实现
│   │   ├── styles/
│   │   │   ├── control.css             # 控制面板样式
│   │   │   └── overlay.css             # 文档窗口样式
│   │   └── types/                      # 前端类型定义
│   └── vite.config.ts
│
├── nodejs/                              # 后端 (TypeScript + WebSocket)
│   └── server/
│       ├── index.ts                     # WebSocket 服务入口
│       ├── compose.ts                   # 组合根（唯一 new 的地方）
│       ├── config.ts                    # 环境配置（运行时校验 + 多供应商模板）
│       ├── modules/
│       │   ├── pipeline/
│       │   │   ├── domain/             # 领域层（纯 TS，零依赖）
│       │   │   │   ├── AudioPipeline.service.ts          # 管道核心
│       │   │   │   ├── LiveDocument.entity.ts             # 转录文档聚合根
│       │   │   │   ├── LiveLine.entity.ts                 # 稳定身份行（UUID + 三段版本号）
│       │   │   │   ├── MergeGroup.value-object.ts         # 合并组值对象
│       │   │   │   ├── MergeGroupManager.service.ts       # 合并组管理器
│       │   │   │   ├── TranscriptDiffEngine.service.ts    # LLM 结果 diff + 合并检测
│       │   │   │   ├── LiveDocumentRenderer.service.ts    # Markdown 渲染
│       │   │   │   ├── IASRService.port.ts               # ASR 接口
│       │   │   │   ├── INMTService.port.ts               # NMT 接口
│       │   │   │   ├── ICorrectionService.port.ts        # LLM 修正接口
│       │   │   │   ├── ITranscriptRepository.port.ts     # 持久化接口
│       │   │   │   └── __tests__/                         # 49 个单元测试
│       │   │   ├── application/
│       │   │   │   └── AudioPipelineUseCase.ts
│       │   │   └── infrastructure/     # 基础设施层（外部服务适配器）
│       │   │       ├── AzureASRService.ts
│       │   │       ├── IFlytekASRService.ts
│       │   │       ├── BaiduNMTService.ts
│       │   │       ├── NmtSchedulerService.ts            # 去重/并发/优先级调度
│       │   │       ├── LLMCorrectionService.ts
│       │   │       └── MarkdownFileRepository.ts
│       │   ├── session/
│       │   │   ├── domain/             # Session 实体 + AudioFormat VO
│       │   │   └── infrastructure/     # InMemorySessionRepository
│       │   └── presentation/
│       │       └── wsHandler.ts         # WebSocket 事件路由
│       └── sessions/                    # 转录文档持久化（*.md，自动生成）
│
├── shared/                               # 前后端共享
│   ├── errors/
│   │   └── AppError.ts                  # 异常体系（基类 + 7 子类）
│   └── types/
│       └── websocket.ts                 # WebSocket 协议 DTO
│
├── package.json                          # monorepo 根（脚本路由）
└── README.md
```

---

## 架构

### 清洁架构

前后端均遵循四层清洁架构。`compose.ts` 是唯一 `new` 具体实现类的地方，依赖方向：

```
presentation → application → domain ← infrastructure
```

- **domain/** 纯 TypeScript，零外部依赖，可独立测试
- **application/** 用例编排，不包含业务规则
- **infrastructure/** 实现 domain 接口（DIP 依赖反转）
- **presentation/** React 组件 / WebSocket 路由，不含业务逻辑

### 数据流

```
系统音频（PCM）
  │
  ▼  WebSocket 推送
┌──────────────┐    ┌─────────────────────────────────────────┐
│ 前端 (Electron)│    │              后端 (Node.js)               │
│              │    │                                         │
│ ControlPanel │    │  wsHandler → AudioPipeline               │
│     │        │    │       │                                  │
│     ▼        │    │       ▼                                  │
│ AudioCapture │───▶│  ASR 语音识别                             │
│ WebSocket    │    │  (Azure / 讯飞)                           │
│     │        │    │       │ partial + final 文本               │
│     │        │    │       ▼                                  │
│     │        │    │  LiveDocument.appendOrRefine()            │
│     │        │    │  → 稳定 lineId (UUID)                     │
│     │        │    │       │                                  │
│     │        │    │       ▼                                  │
│     │        │    │  NMT 快速翻译 (fire & forget)              │
│     │        │    │  (百度 + NmtScheduler 去重/并发)           │
│     │        │    │       │                                  │
│     │        │    │       ▼  每 3 句触发                       │
│     │        │    │  LLM 全文修正                              │
│     │        │    │  ① diff 中文修正                           │
│     │        │    │  ② detectMerges 隐藏增量行                  │
│     │        │    │       │                                  │
│     │        │    │       ▼                                  │
│     │        │    │  toMarkdown() + 文件持久化                  │
│     │        │    │       │                                  │
│     │  ◀────┼────┼─── document:content (Markdown)             │
│     ▼        │    │                                         │
│ TranscriptOv.│    │                                         │
│ (Markdown    │    │                                         │
│  渲染+滚底)  │    │                                         │
└──────────────┘    └─────────────────────────────────────────┘
```

### LiveLine 稳定身份

ASR 实时转写中同一句话会被多次增量修正（`"I hear"` → `"I hear birds"` → `"I hear birds chirping"`）。**LiveLine** 使用 UUID 作为稳定身份，`appendOrRefine()` 在所有行（含已隐藏行）中反序搜索前缀匹配，同一句话始终返回相同 `lineId`。NMT 回调携带 `sourceVersion` 做陈旧守卫——若 ASR 已在 NMT 完成前更新了该句文本，旧翻译自动丢弃。

### MergeGroup 合并去重

LLM 检测到连续增量行后，**隐藏**旧版本而非删除：
- 隐藏行在 `.md` 输出为 HTML 注释 `<!-- merged: ... -->`，完整保留数据
- ASR 继续修正已隐藏行时，`MergeGroupManager` 自动检测状态过期并恢复

### NmtScheduler 调度器

- **请求去重**：相同文本 60s 内复用缓存，in-flight 请求合并
- **并发控制**：最多 3 请求并发
- **优先级调度**：标点/分段触发的高优任务跳过队首
- **队列合并**：同一 lineId 只保留最新任务

---

## 环境变量

```env
# ── ASR 语音识别 ──
ASR_PROVIDER=azure              # azure | iflytek
AZURE_SPEECH_KEY=               # Azure 订阅密钥
AZURE_SPEECH_REGION=eastasia

# ── NMT 快速翻译 ──
NMT_PROVIDER=baidu              # baidu | placeholder
BAIDU_APP_ID=
BAIDU_API_KEY=

# ── LLM 智能修正 ──
TRANSLATION_PROVIDER=zhipu      # openai | deepseek | siliconflow | bailian | zhipu | spark
ZHIPU_API_KEY=

# ── 服务配置 ──
SERVER_PORT=3001
```

---

## WebSocket 协议

### 客户端 → 服务端

| type | 说明 |
|------|------|
| `session:start` | 启动会话（含 `audioFormat` 和 `mode`） |
| `session:stop` | 停止会话 |
| `audio:chunk` | 二进制 PCM 音频帧（含 `timestamp` 和 `sequence`） |

### 服务端 → 客户端

| type | 说明 |
|------|------|
| `document:content` | 全文 Markdown（含 `version`） |
| `document:partial` | 实时英文 partial 文本 |
| `pipeline:status` | 管道状态（asr_connecting / asr_connected / asr_error） |
| `session:error` | 错误（含 `code` 和 `message`） |

---

## Electron IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `viewer:open` | 控制面板 → 主进程 | 打开文档窗口 |
| `viewer:close` | 控制面板 → 主进程 | 关闭文档窗口 |
| `document:content` | 控制面板 → 主进程 → 文档窗口 | 推送 Markdown + version |
| `document:clear` | 控制面板 → 主进程 → 文档窗口 | 清空文档内容 |
| `overlay:applyStyle` | 控制面板 → 主进程 → 文档窗口 | 透明度/字号/颜色同步 |

---

## 测试

```bash
# 后端（49 用例）
cd nodejs && npx vitest run

# 类型检查
cd nodejs && npx tsc --noEmit
cd electron && npx tsc --noEmit
```

测试覆盖：LiveDocument（17 用例）、LiveLine、TranscriptDiffEngine（10 用例）、MergeGroupManager（5 用例）、Session 状态机。

---

## 答译文案

> FloatTrans AI 是一个极简桌面实时同声传译文档助手。我们设计成控制面板 + 独立文档窗口的双窗口架构——用户用控制面板启停监听、调节样式，同传文档在可自由缩放拖拽的独立窗口中流式更新，不干扰主屏幕内容。
>
> 后端管道采用清洁架构：ASR 语音识别 → LiveDocument 稳定身份聚合根 → NMT 逐句翻译（含陈旧守卫和 NmtScheduler 调度器）→ LLM 全文智能修正。LiveLine 的 UUID 稳定身份解决了实时转写中增量修正的身份漂移问题；MergeGroup 合并去重在不删除原始行的前提下隐藏增量版本。
>
> v2.0 完整重写为前后端分离架构：前端 Electron + React 19 + Vite 6，后端 Node.js + WebSocket + tsx，支持 Azure/讯飞 ASR、百度翻译 NMT、6 家 LLM 供应商一键切换。
