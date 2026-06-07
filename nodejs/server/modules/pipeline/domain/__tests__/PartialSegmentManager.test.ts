// PartialSegmentManager.test.ts — 片段聚合器单元测试
// 验证：ASR 多次 partial 修订不会产生重复弹幕条目

import { describe, it, expect, beforeEach } from "vitest";
import { PartialSegmentManager } from "../PartialSegmentManager.service";

describe("PartialSegmentManager", () => {
  let mgr: PartialSegmentManager;

  beforeEach(() => {
    mgr = new PartialSegmentManager();
  });

  // ===== 核心场景：同一 utterance 逐步扩展 =====
  describe("同一句话逐步扩展（最常见）", () => {
    it('"I" → 新 utterance → segmentId 不变', () => {
      const s1 = mgr.acceptPartial("I");
      expect(s1.isNewUtterance).toBe(true);
      expect(s1.isFinal).toBe(false);
      expect(s1.text).toBe("I");

      const id1 = s1.segmentId;

      const s2 = mgr.acceptPartial("I am");
      expect(s2.isNewUtterance).toBe(false); // 不是新 utterance
      expect(s2.segmentId).toBe(id1);        // 同一个 ID
      expect(s2.text).toBe("I am");

      const s3 = mgr.acceptPartial("I am Chen");
      expect(s3.isNewUtterance).toBe(false);
      expect(s3.segmentId).toBe(id1);
      expect(s3.text).toBe("I am Chen");
    });

    it('"Hello" → "Hello world" → "Hello world today" → 始终一个 ID', () => {
      const ids = new Set<string>();
      ids.add(mgr.acceptPartial("Hello").segmentId);
      ids.add(mgr.acceptPartial("Hello world").segmentId);
      ids.add(mgr.acceptPartial("Hello world today").segmentId);
      // 所有 partial 共享同一个 ID
      expect(ids.size).toBe(1);
    });
  });

  // ===== ASR 倒退修正 =====
  describe("ASR 倒退修正", () => {
    it('"I am going to" → "I am" → 同一 utterance，不新建', () => {
      const s1 = mgr.acceptPartial("I am going to");
      expect(s1.isNewUtterance).toBe(true);
      const id1 = s1.segmentId;

      const s2 = mgr.acceptPartial("I am");
      expect(s2.isNewUtterance).toBe(false);
      expect(s2.segmentId).toBe(id1);
      expect(s2.text).toBe("I am");
    });

    it('"We need to discuss" → "We need" → 不倒回后继续', () => {
      const s1 = mgr.acceptPartial("We need to discuss");
      const id = s1.segmentId;

      mgr.acceptPartial("We need");
      const s3 = mgr.acceptPartial("We need to discuss the plan");
      expect(s3.isNewUtterance).toBe(false);
      expect(s3.segmentId).toBe(id);
    });
  });

  // ===== 上下文突变：新 utterance =====
  describe("上下文突变 → 新 utterance", () => {
    it('"I am Chen" → "Today is Monday" → 全新 utterance', () => {
      const s1 = mgr.acceptPartial("I am Chen");
      expect(s1.isNewUtterance).toBe(true);

      const s2 = mgr.acceptPartial("Today is Monday");
      expect(s2.isNewUtterance).toBe(true); // 完全不同 → 新 ID
      expect(s2.segmentId).not.toBe(s1.segmentId);
    });

    it('"Hello" → "Goodbye everyone" → 编辑距离超阈值 → 新 utterance', () => {
      const s1 = mgr.acceptPartial("Hello");
      const s2 = mgr.acceptPartial("Goodbye everyone");
      expect(s2.isNewUtterance).toBe(true);
      expect(s2.segmentId).not.toBe(s1.segmentId);
    });
  });

  // ===== Final 行为 =====
  describe("Final 最终化", () => {
    it("acceptFinal 返回 isFinal=true 并清空活跃段", () => {
      mgr.acceptPartial("I am Chen");
      const f = mgr.acceptFinal("I am Chen Qiyuan");
      expect(f.isFinal).toBe(true);
      expect(f.text).toBe("I am Chen Qiyuan");

      // Final 之后下一个 partial 应该是新 utterance
      const next = mgr.acceptPartial("Next sentence");
      expect(next.isNewUtterance).toBe(true);
      expect(next.segmentId).not.toBe(f.segmentId);
    });

    it("没有 prior partial 直接 final → 自动生成 segmentId", () => {
      const f = mgr.acceptFinal("Standalone sentence");
      expect(f.isFinal).toBe(true);
      expect(f.segmentId).toBeTruthy();
      expect(f.text).toBe("Standalone sentence");
    });
  });

  // ===== Reset =====
  describe("Reset", () => {
    it("reset 后状态全部清空", () => {
      mgr.acceptPartial("Some text");
      mgr.reset();

      const s = mgr.acceptPartial("New text");
      expect(s.isNewUtterance).toBe(true);
      expect(s.text).toBe("New text");
    });
  });

  // ===== 边界情况 =====
  describe("边界情况", () => {
    it("空字符串", () => {
      const s1 = mgr.acceptPartial("");
      expect(s1.isNewUtterance).toBe(true);
      expect(s1.text).toBe("");

      // 空字符串后接 "Hello"：空字符串 is prefix of any string，
      // startsWith("") === true → 同一 utterance 扩展
      const s2 = mgr.acceptPartial("Hello");
      expect(s2.isNewUtterance).toBe(false);
      expect(s2.segmentId).toBe(s1.segmentId);
    });

    it("相同文本重复 partial", () => {
      const s1 = mgr.acceptPartial("Hello");
      const s2 = mgr.acceptPartial("Hello");
      expect(s2.isNewUtterance).toBe(false);
      expect(s2.segmentId).toBe(s1.segmentId);
    });

    it("标点符号变化-后缀扩展", () => {
      const s1 = mgr.acceptPartial("I am Chen");
      const s2 = mgr.acceptPartial("I am Chen.");
      expect(s2.isNewUtterance).toBe(false);
      expect(s2.segmentId).toBe(s1.segmentId);
    });

    it("长文本逐步扩展 10+ 轮", () => {
      const words = [
        "The",
        "The quick",
        "The quick brown",
        "The quick brown fox",
        "The quick brown fox jumps",
        "The quick brown fox jumps over",
        "The quick brown fox jumps over the",
        "The quick brown fox jumps over the lazy",
        "The quick brown fox jumps over the lazy dog",
      ];
      const s1 = mgr.acceptPartial(words[0]!);
      const id = s1.segmentId;

      for (let i = 1; i < words.length; i++) {
        const s = mgr.acceptPartial(words[i]!);
        expect(s.isNewUtterance).toBe(false);
        expect(s.segmentId).toBe(id);
      }
    });
  });
});
