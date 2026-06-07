// AudioPipeline.partial.test.ts — 音频管道集成测试
// 验证：PartialSegmentManager 集成后，同一 utterance 的多次 partial 不产生重复弹幕

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AudioPipeline } from "../AudioPipeline.service";
import { PartialSegmentManager } from "../PartialSegmentManager.service";
import type {
  IASRService,
  ASRResultCallback,
  PartialResultCallback,
  ASRErrorCallback,
  ReadyCallback,
} from "../IASRService.port";
import type { INMTService } from "../INMTService.port";
import type { ICorrectionService } from "../ICorrectionService.port";
import type { ISpeechTextNormalizer } from "../ISpeechTextNormalizer.port";
import type { IAdaptiveDebounceStrategy } from "../IAdaptiveDebounceStrategy.port";
import type { PipelineOutputPort, DanmakuEntrySnapshot } from "../PipelineOutputPort.port";
import type { Session } from "../../../session/domain/Session.entity";
import type { CorrectionSuggestion } from "../CorrectionSuggestion.value-object";
import type { CorrectionRequest } from "../CorrectionRequest.value-object";

// ===== 工具函数 =====

/** 创建一个极简 Session mock，只满足 Pipeline 的最低要求 */
function makeSession(): Session {
  return {
    id: "test-session",
    state: "listening",
    segments: [],
    corrections: [],
    startedAt: Date.now(),
    audioFormat: { sampleRate: 16000, bitDepth: 16, channels: 1 },
    start() {},
    pause() {},
    stop() {},
    addSegment() {},
    applyCorrection() {},
    getContext() {
      return [];
    },
  } as unknown as Session;
}

/** 创建 Mock ASR 服务 —— 手动触发回调 */
function makeMockASR() {
  let onReady: ReadyCallback | null = null;
  let onPartial: PartialResultCallback | null = null;
  let onFinal: ASRResultCallback | null = null;
  let onError: ASRErrorCallback | null = null;

  const service: IASRService = {
    startRecognition: vi.fn(async () => {}),
    stopRecognition: vi.fn(async () => {}),
    pushAudio: vi.fn(),
    onReady: vi.fn((cb: ReadyCallback) => { onReady = cb; }),
    onPartialResult: vi.fn((cb: PartialResultCallback) => { onPartial = cb; }),
    onFinalResult: vi.fn((cb: ASRResultCallback) => { onFinal = cb; }),
    onError: vi.fn((cb: ASRErrorCallback) => { onError = cb; }),
  };

  return {
    service,
    emitReady() { onReady?.(); },
    emitPartial(text: string) { onPartial?.(text); },
    emitFinal(text: string, confidence = 0.95, startTime = 0, endTime = 0) {
      onFinal?.({ text, confidence, startTime, endTime });
    },
    emitError(err: Error) { onError?.(err); },
  };
}

/** 创建 Mock NMT 服务 —— 快速返回固定翻译 */
function makeMockNMT() {
  return {
    translate: vi.fn(async (text: string) => `[译]${text}`),
  } satisfies INMTService as INMTService;
}

/** 创建 Mock 修正服务 —— 始终返回空修正 */
function makeMockCorrection(): ICorrectionService {
  return {
    review: vi.fn(async (_req: CorrectionRequest): Promise<readonly CorrectionSuggestion[]> => []),
  };
}

/** 创建 Mock 归一化器 —— 原文返回 */
function makeMockNormalizer(): ISpeechTextNormalizer {
  return {
    normalizeForTranslation: vi.fn((text: string) => ({ normalized: text, removedRepetitions: false })),
    normalizeTranslationOutput: vi.fn((text: string) => text),
  };
}

/** 创建 Mock 防抖引擎 —— 立即翻译，无延迟 */
function makeInstantDebounce(): IAdaptiveDebounceStrategy {
  return {
    decide: vi.fn(() => ({ debounceMs: 0, shouldTranslate: true })),
  };
}

/** 创建 Mock 翻译门控 —— 允许所有 stage（向后兼容旧测试） */
function makePermissiveGate() {
  return {
    shouldTranslate: vi.fn(() => true),
  };
}

/** 创建 Mock 输出端口 —— 记录所有 danmaku 调用 */
function makeRecordingOutput() {
  const pushes: DanmakuEntrySnapshot[] = [];
  const updates: Array<{ id: string; chinese: string; isComplete: boolean }> = [];
  const corrects: Array<{ id: string; oldChinese: string; newChinese: string }> = [];
  const evicts: string[] = [];

  const output: PipelineOutputPort = {
    sendSegment: vi.fn(),
    sendPartial: vi.fn(),
    sendStatus: vi.fn(),
    sendError: vi.fn(),
    isAvailable: vi.fn(() => true),
    sendDanmakuPush(entry: DanmakuEntrySnapshot) { pushes.push(entry); },
    sendDanmakuUpdate(id: string, chinese: string, isComplete: boolean) {
      updates.push({ id, chinese, isComplete });
    },
    sendDanmakuCorrect(id: string, oldChinese: string, newChinese: string) {
      corrects.push({ id, oldChinese, newChinese });
    },
    sendDanmakuEvict(id: string) { evicts.push(id); },
  };

  return { output, pushes, updates, corrects, evicts };
}

/** 构建完整测试 Pipeline（使用允许所有 partial 的 gate，保持向后兼容） */
function makePipeline() {
  const asr = makeMockASR();
  const nmt = makeMockNMT();
  const correction = makeMockCorrection();
  const normalizer = makeMockNormalizer();
  const debounce = makeInstantDebounce();
  const segmentManager = new PartialSegmentManager();
  const gate = makePermissiveGate();
  const rec = makeRecordingOutput();

  const pipeline = new AudioPipeline(
    asr.service,
    nmt,
    correction,
    normalizer,
    debounce,
    segmentManager,
    gate,
  );

  return { pipeline, asr, nmt, rec, segmentManager };
}

// ===== 测试用例 =====

describe("AudioPipeline — Partial 聚合集成测试", () => {
  let pipeline: AudioPipeline;
  let asr: ReturnType<typeof makeMockASR>;
  let nmt: ReturnType<typeof makeMockNMT>;
  let rec: ReturnType<typeof makeRecordingOutput>;
  let onSegmentCalls: Array<{ segmentId: string; english: string; chinese: string }>;
  let onPartialCalls: string[];

  beforeEach(async () => {
    const p = makePipeline();
    pipeline = p.pipeline;
    asr = p.asr;
    nmt = p.nmt;
    rec = p.rec;

    onSegmentCalls = [];
    onPartialCalls = [];

    const session = makeSession();
    await pipeline.start(session, rec.output);

    pipeline.setCallbacks(
      (seg) => { onSegmentCalls.push(seg); },
      (text) => { onPartialCalls.push(text); },
      (err) => { throw err; },
    );
  });

  // ================================================================
  // 核心场景：同一 utterance，多次 partial → 只推一次弹幕
  // ================================================================
  describe("同一 utterance 逐步扩展 → 一条弹幕", () => {
    it('"I" → "I am" → "I am Chen" → 仅 push 1 次', () => {
      // 第一个 partial → push（新 utterance）
      asr.emitPartial("I");
      expect(rec.pushes).toHaveLength(1);
      expect(rec.pushes[0]!.english).toBe("I");
      expect(rec.pushes[0]!.status).toBe("draft");
      expect(rec.pushes[0]!.id).toBeTruthy();

      // 第二个 partial（同一句延伸）→ 不 push 新条目
      asr.emitPartial("I am");
      expect(rec.pushes).toHaveLength(1); // 仅一条 push

      // 第三个 partial（再延伸）→ 仍不 push
      asr.emitPartial("I am Chen");
      expect(rec.pushes).toHaveLength(1); // 始终 1 条
    });

    it('"Hello" → "Hello world" → "Hello world today" → 1 push', () => {
      asr.emitPartial("Hello");
      asr.emitPartial("Hello world");
      asr.emitPartial("Hello world today");
      expect(rec.pushes).toHaveLength(1);
    });
  });

  // ================================================================
  // 上下文突变 → 两条弹幕
  // ================================================================
  describe("上下文突变 → 多条弹幕", () => {
    it('"I am Chen" → "Today is Monday" → 2 条 push', () => {
      asr.emitPartial("I am Chen");
      expect(rec.pushes).toHaveLength(1);
      const id1 = rec.pushes[0]!.id;

      // 完全不同的一句
      asr.emitPartial("Today is Monday");
      expect(rec.pushes).toHaveLength(2);
      expect(rec.pushes[1]!.id).not.toBe(id1);
      expect(rec.pushes[1]!.english).toBe("Today is Monday");
    });

    it('连续 3 句不相关 → 3 条 push', () => {
      asr.emitPartial("First sentence here");
      asr.emitPartial("Second one now");
      asr.emitPartial("Third completely different");
      expect(rec.pushes).toHaveLength(3);
    });
  });

  // ================================================================
  // Partial → Final 流程
  // ================================================================
  describe("Partial → Final 流程", () => {
    it("partial 建立 draft → final 不新增 push", async () => {
      asr.emitPartial("Hello world");

      // 等待异步 NMT 完成
      await new Promise((r) => setTimeout(r, 100));

      // final: 同 ID，不新增 push
      const pushesBefore = rec.pushes.length;
      asr.emitFinal("Hello world today");
      expect(rec.pushes).toHaveLength(pushesBefore);

      // 等 final 的 NMT 完成
      await new Promise((r) => setTimeout(r, 100));

      // final 产生了一个 complete update
      const completeUpdates = rec.updates.filter((u) => u.isComplete);
      expect(completeUpdates.length).toBeGreaterThan(0);
    });

    it("direct final without partial → 自动 push + update", async () => {
      // 没有 prior partial，直接发 final
      asr.emitFinal("Standalone sentence");

      // 应该自动 push 了 draft
      expect(rec.pushes.length).toBeGreaterThan(0);
      expect(rec.pushes[0]!.english).toBe("Standalone sentence");
    });
  });

  // ================================================================
  // 弹幕池满 → evict
  // ================================================================
  describe("弹幕池溢出 → evict", () => {
    it("超过 MAX=10 时弹出最旧条目", () => {
      // 连续推 11 条差异足够大的句子，确保 PartialSegmentManager 识别为不同 utterance
      const texts = [
        "Sunrise in the east",
        "Birds fly across sky",
        "Coffee is my favorite",
        "Library closes at nine",
        "She played piano well",
        "Winter snow covers peak",
        "Cat slept on the blanket",
        "He drove to office early",
        "Fresh bread smells good",
        "River flows through valley",
        "Stars appear in night sky",
      ];
      for (let i = 0; i < texts.length; i++) {
        asr.emitPartial(texts[i]!);
      }

      // 第 11 条触发弹幕池溢出 → evict
      expect(rec.evicts.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // 异步 NMT 翻译验证
  // ================================================================
  describe("异步 NMT 翻译 → danmakuUpdate", () => {
    it("partial → NMT 完成 → danmakuUpdate 含中文", async () => {
      asr.emitPartial("Hello");

      // 等异步翻译完成
      await new Promise((r) => setTimeout(r, 200));

      expect(rec.updates.length).toBeGreaterThan(0);
      if (rec.updates.length > 0) {
        expect(rec.updates[0]!.chinese).toBe("[译]Hello");
        expect(rec.updates[0]!.id).toBe(rec.pushes[0]!.id);
      }
    });
  });

  // ================================================================
  // 翻译门控测试：FinalOnlyTranslationGate 阻止 partial NMT
  // ================================================================
  describe("门控阻止 partial NMT 翻译", () => {
    it("partial 不触发 NMT → danmaku 保持 draft 状态（无中文更新）", async () => {
      const asr2 = makeMockASR();
      const nmt2 = makeMockNMT();
      const rec2 = makeRecordingOutput();
      const segmentMgr2 = new PartialSegmentManager();

      // 门控：仅 final 允许翻译
      const gate = { shouldTranslate: (_s: { isFinal: boolean }) => _s.isFinal };

      const pipeline2 = new AudioPipeline(
        asr2.service,
        nmt2,
        makeMockCorrection(),
        makeMockNormalizer(),
        makeInstantDebounce(),
        segmentMgr2,
        gate,
      );

      const session = makeSession();
      await pipeline2.start(session, rec2.output);

      pipeline2.setCallbacks(
        () => {},
        () => {},
        (err) => { throw err; },
      );

      // 发送 3 次 partial（同一句话逐步扩展）
      asr2.emitPartial("I");
      asr2.emitPartial("I am");
      asr2.emitPartial("I am Chen");

      // 等异步时间
      await new Promise((r) => setTimeout(r, 200));

      // 验证：弹幕 push 了（draft），但无 NMT 更新（gate 阻止了）
      expect(rec2.pushes).toHaveLength(1);
      expect(rec2.pushes[0]!.english).toBe("I");
      expect(rec2.pushes[0]!.chinese).toBe("");
      // NMT 从未被调用（gate 阻止了所有 partial 翻译）
      expect(nmt2.translate).not.toHaveBeenCalled();
    });

    it("final 触发 NMT → danmaku 获得中文翻译", async () => {
      const asr2 = makeMockASR();
      const nmt2 = makeMockNMT();
      const rec2 = makeRecordingOutput();
      const segmentMgr2 = new PartialSegmentManager();

      const gate = { shouldTranslate: (_s: { isFinal: boolean }) => _s.isFinal };

      const pipeline2 = new AudioPipeline(
        asr2.service,
        nmt2,
        makeMockCorrection(),
        makeMockNormalizer(),
        makeInstantDebounce(),
        segmentMgr2,
        gate,
      );

      const session = makeSession();
      await pipeline2.start(session, rec2.output);

      pipeline2.setCallbacks(
        () => {},
        () => {},
        (err) => { throw err; },
      );

      // partial 建立草稿
      asr2.emitPartial("Hello world");
      // final 触发 NMT
      asr2.emitFinal("Hello world today");

      await new Promise((r) => setTimeout(r, 200));

      // 验证：NMT 被 final 触发
      expect(nmt2.translate).toHaveBeenCalledWith("Hello world today");
      // danmaku 已更新中文
      const finalUpdate = rec2.updates.find((u) => u.isComplete);
      expect(finalUpdate).toBeTruthy();
      expect(finalUpdate!.chinese).toBe("[译]Hello world today");
    });
  });
});

// ================================================================
// PartialSegmentManager 独立单元测试（已在另一个文件中）
// 这里只做 Pipeline 集成验证
// ================================================================
