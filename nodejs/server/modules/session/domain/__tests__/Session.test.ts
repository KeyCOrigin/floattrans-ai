import { describe, it, expect } from "vitest";
import { Session } from "../Session.entity";
import type { AudioFormat } from "../AudioFormat.value-object";

const defaultFormat: AudioFormat = {
  sampleRate: 16000,
  bitDepth: 16,
  channels: 1,
};

describe("Session (Server)", () => {
  it("create 返回 idle 状态的会话", () => {
    const session = Session.create(defaultFormat);
    expect(session.state).toBe("idle");
  });

  it("start 将状态从 idle 切换到 listening", () => {
    const session = Session.create(defaultFormat);
    session.start();
    expect(session.state).toBe("listening");
  });

  it("pause 将状态从 listening 切换到 paused", () => {
    const session = Session.create(defaultFormat);
    session.start();
    session.pause();
    expect(session.state).toBe("paused");
  });

  it("stop 将状态切换到 stopped", () => {
    const session = Session.create(defaultFormat);
    session.start();
    session.stop();
    expect(session.state).toBe("stopped");
  });

  it("addSegment 追加字幕片段", () => {
    const session = Session.create(defaultFormat);
    session.addSegment({
      id: "seg_001",
      startTime: 0,
      endTime: 4,
      english: "Hello.",
      chinese: "你好。",
      status: "final",
      confidence: 0.95,
    });
    expect(session.segments).toHaveLength(1);
    expect(session.segments[0]?.english).toBe("Hello.");
  });

  it("applyCorrection 修正已存在的 segment", () => {
    const session = Session.create(defaultFormat);
    session.addSegment({
      id: "seg_001",
      startTime: 0,
      endTime: 4,
      english: "We use rest.",
      chinese: "我们使用休息。",
      status: "final",
      confidence: 0.7,
    });
    session.applyCorrection({
      segmentId: "seg_001",
      oldEnglish: "We use rest.",
      newEnglish: "We use Rust.",
      oldChinese: "我们使用休息。",
      newChinese: "我们使用 Rust。",
      reason: "上下文修正",
    });
    const seg = session.segments[0];
    expect(seg?.english).toBe("We use Rust.");
    expect(seg?.status).toBe("revised");
  });

  it("getContext 返回最近 N 句", () => {
    const session = Session.create(defaultFormat);
    for (let i = 0; i < 5; i++) {
      session.addSegment({
        id: `seg_${i}`,
        startTime: i * 4,
        endTime: (i + 1) * 4,
        english: `Sentence ${i}`,
        chinese: `句子 ${i}`,
        status: "final",
        confidence: 0.9,
      });
    }
    const ctx = session.getContext(3);
    expect(ctx).toHaveLength(3);
    expect(ctx[0]?.en).toBe("Sentence 2");
    expect(ctx[2]?.en).toBe("Sentence 4");
  });

  it("segments 返回只读数组", () => {
    const session = Session.create(defaultFormat);
    expect(Array.isArray(session.segments)).toBe(true);
  });

  it("会话具有唯一 ID", () => {
    const s1 = Session.create(defaultFormat);
    const s2 = Session.create(defaultFormat);
    expect(s1.id).not.toBe(s2.id);
  });
});
