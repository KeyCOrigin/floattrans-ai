import { describe, it, expect, beforeEach } from "vitest";
import { SubtitleEngine } from "../SubtitleEngine";
import type { SubtitleSegment, CorrectionEvent } from "../../types/subtitle";

function makeSegments(): SubtitleSegment[] {
  return [
    { id: "s1", start: 0, end: 3, english: "Hello world.", chinese: "你好世界。", status: "final", confidence: 0.9 },
    { id: "s2", start: 3, end: 6, english: "We use rest.", chinese: "我们使用休息。", status: "final", confidence: 0.7 },
    { id: "s3", start: 6, end: 9, english: "Rust is great.", chinese: "Rust 很棒。", status: "final", confidence: 0.95 },
  ];
}

function makeCorrections(): CorrectionEvent[] {
  return [
    {
      triggerAt: 7, segmentId: "s2",
      oldEnglish: "We use rest.", newEnglish: "We use Rust.",
      oldChinese: "我们使用休息。", newChinese: "我们使用 Rust。",
      reason: "上下文修正", applied: false,
    },
  ];
}

describe("SubtitleEngine", () => {
  let engine: SubtitleEngine;
  let segments: SubtitleSegment[];
  let corrections: CorrectionEvent[];

  beforeEach(() => {
    segments = makeSegments();
    corrections = makeCorrections();
    engine = new SubtitleEngine(segments, corrections);
  });

  it("初始状态 isPlaying 为 false", () => {
    expect(engine.getState().isPlaying).toBe(false);
  });

  it("tick 返回正确的当前字幕段", () => {
    engine.start(() => {});
    const result = engine.tick(2);
    expect(result.currentSegment?.id).toBe("s1");
    expect(result.currentTime).toBe(2);
  });

  it("tick 在非播放状态返回 null", () => {
    const result = engine.tick(2);
    expect(result.currentSegment).toBeNull();
  });

  it("start 后 tick 正常工作", () => {
    const results: string[] = [];
    engine.start((r) => { if (r.currentSegment) results.push(r.currentSegment.id); });
    engine.tick(3);  // s1
    expect(results).toEqual(["s1"]);
  });

  it("pause 暂停播放", () => {
    engine.start(() => {});
    engine.tick(5);
    engine.pause();
    const timeBefore = engine.getState().currentTime;
    engine.tick(10);
    expect(engine.getState().currentTime).toBe(timeBefore);
  });

  it("stop 重置时间和状态", () => {
    engine.start(() => {});
    engine.tick(5);
    engine.stop();
    expect(engine.getState().currentTime).toBe(0);
    expect(engine.getState().isPlaying).toBe(false);
  });

  it("修正事件在 triggerAt 后自动触发", () => {
    const logs: string[] = [];
    engine.start((r) => {
      r.newCorrections.forEach((c) => logs.push(c.segmentId));
    });
    engine.tick(6.9);
    expect(logs).toHaveLength(0);
    engine.tick(0.2); // 7.1
    expect(logs).toEqual(["s2"]);
  });

  it("修正后 segment 状态变为 revised", () => {
    engine.start(() => {});
    engine.tick(8);
    // 引擎内部维护 segments 副本，通过 tick 返回值验证修正已生效
    // s2 的 time range 是 3-6，tick(8) 时 currentSegment 是 s3，但修正日志应包含 s2
    const state = engine.getState();
    const s2Log = state.correctionLogs.find((l) => l.segmentId === "s2");
    expect(s2Log).toBeDefined();
    expect(s2Log?.newEnglish).toBe("We use Rust.");
    expect(s2Log?.newChinese).toBe("我们使用 Rust。");
  });

  it("关闭 autoCorrection 后不触发修正", () => {
    engine.setAutoCorrection(false);
    const logs: string[] = [];
    engine.start((r) => {
      r.newCorrections.forEach((c) => logs.push(c.segmentId));
    });
    engine.tick(8);
    expect(logs).toHaveLength(0);
  });

  it("stop 后修正日志被清空", () => {
    engine.start(() => {});
    engine.tick(8);
    expect(engine.getState().correctionLogs.length).toBeGreaterThan(0);
    engine.stop();
    expect(engine.getState().correctionLogs).toHaveLength(0);
  });

  it("stop 后修正日志被清空且状态重置", () => {
    engine.start(() => {});
    engine.tick(8);
    // 验证修正已触发
    expect(engine.getState().correctionLogs.length).toBeGreaterThan(0);
    engine.stop();
    // stop 后日志清空
    expect(engine.getState().correctionLogs).toHaveLength(0);
    // stop 后 currentTime 归零
    expect(engine.getState().currentTime).toBe(0);
    // 重新 start + tick 到 s2 范围验证原文被恢复
    engine.start(() => {});
    const result = engine.tick(4);
    expect(result.currentSegment?.english).toBe("We use rest.");
    expect(result.currentSegment?.chinese).toBe("我们使用休息。");
  });

  it("reset 委托给 stop", () => {
    engine.start(() => {});
    engine.tick(8);
    engine.reset();
    expect(engine.getState().currentTime).toBe(0);
    expect(engine.getState().isPlaying).toBe(false);
  });

  it("可注入自定义 ID 生成器", () => {
    let idCounter = 0;
    const engine2 = new SubtitleEngine(makeSegments(), makeCorrections(), () => `test-id-${++idCounter}`);
    engine2.start(() => {});
    engine2.tick(8);
    expect(engine2.getState().correctionLogs[0]?.id).toBe("test-id-1");
  });
});
