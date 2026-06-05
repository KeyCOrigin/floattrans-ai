import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProcessSubtitleUseCase, type RenderCallback } from "../ProcessSubtitleUseCase";
import type { SubtitleEngine } from "../../../../engine/SubtitleEngine";
import type { SubtitleSegment } from "../../../../types/subtitle";

function makeSegment(overrides: Partial<SubtitleSegment> = {}): SubtitleSegment {
  return {
    id: "seg_001", start: 0, end: 4,
    english: "Hello world.", chinese: "你好世界。",
    status: "final", confidence: 0.9, ...overrides,
  };
}

function makeMockEngine(): SubtitleEngine {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    tick: vi.fn(),
    getState: vi.fn(() => ({ isPlaying: false, currentTime: 0, currentSegmentId: null, correctionLogs: [] })),
    setAutoCorrection: vi.fn(),
  } as unknown as SubtitleEngine;
}

describe("ProcessSubtitleUseCase", () => {
  let useCase: ProcessSubtitleUseCase;
  let rendered: (SubtitleSegment | null)[];
  let mockEngine: SubtitleEngine;

  beforeEach(() => {
    rendered = [];
    mockEngine = makeMockEngine();
    const onRender: RenderCallback = (seg) => rendered.push(seg);
    useCase = new ProcessSubtitleUseCase(mockEngine, onRender);
  });

  it("handleSegment 触发渲染回调", () => {
    useCase.handleSegment(makeSegment());
    expect(rendered[0]?.english).toBe("Hello world.");
  });

  it("handleCorrection 委托给 engine", () => {
    useCase.handleCorrection({
      triggerAt: 0, segmentId: "seg_001",
      oldEnglish: "Hello world.", newEnglish: "Hello universe.",
      oldChinese: "你好世界。", newChinese: "你好宇宙。",
      reason: "context", applied: false,
    });
    // handleCorrection 触发 onRender(null) 让 UI 重新评估
    expect(rendered[0]).toBeNull();
  });

  it("handlePartial 创建 pending 临时字幕", () => {
    useCase.handlePartial("Today...");
    expect(rendered[0]?.english).toBe("Today...");
    expect(rendered[0]?.status).toBe("pending");
  });

  it("clear 调用 engine.stop", () => {
    useCase.clear();
    expect(mockEngine.stop).toHaveBeenCalled();
  });
});
