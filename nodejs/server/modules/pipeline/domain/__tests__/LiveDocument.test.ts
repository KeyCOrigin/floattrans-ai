// LiveDocument.test.ts — 转录文档聚合根测试（Phase 1）

import { describe, it, expect } from "vitest";
import { LiveDocument } from "../LiveDocument.entity";
import { LiveLine } from "../LiveLine.entity";

describe("LiveDocument", () => {
  it("create 返回空文档", () => {
    const doc = LiveDocument.create("test-session");
    expect(doc.id).toBe("test-session");
    expect(doc.lines).toHaveLength(0);
    expect(doc.version).toBe(0);
    expect(doc.pendingEnglish).toBe("");
  });

  it("updatePartialEnglish 更新 pending english", () => {
    const doc = LiveDocument.create("test");
    doc.updatePartialEnglish("Hello");
    expect(doc.pendingEnglish).toBe("Hello");
    doc.updatePartialEnglish("Hello world");
    expect(doc.pendingEnglish).toBe("Hello world");
    expect(doc.lines).toHaveLength(0);
  });

  it("appendOrRefine 锁定行并清空 pending", () => {
    const doc = LiveDocument.create("test");
    doc.updatePartialEnglish("Hello world today");
    const result = doc.appendOrRefine("Hello world today");
    expect(result).not.toBeNull();
    expect(result!.lineId).toBeTruthy();
    expect(result!.sourceVersion).toBe(1);
    expect(doc.pendingEnglish).toBe("");
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.english).toBe("Hello world today");
    expect(doc.lines[0]!.chinese).toBeNull();
    expect(doc.lines[0]!.status).toBe("pending");
  });

  it("applyNmtResult 填充中文（sourceVersion 匹配）", () => {
    const doc = LiveDocument.create("test");
    const result = doc.appendOrRefine("Hello");
    expect(result).not.toBeNull();
    const applied = doc.applyNmtResult(result!.lineId, "你好", result!.sourceVersion);
    expect(applied).toBe(true);
    expect(doc.lines[0]!.chinese).toBe("你好");
    expect(doc.lines[0]!.status).toBe("translated");
  });

  it("applyNmtResult 陈旧守卫：sourceVersion 不匹配时拒绝", () => {
    const doc = LiveDocument.create("test");
    const result1 = doc.appendOrRefine("Hello");
    expect(result1).not.toBeNull();
    const result2 = doc.appendOrRefine("Hello world");
    expect(result2).not.toBeNull();
    expect(result2!.lineId).toBe(result1!.lineId);
    const applied = doc.applyNmtResult(result1!.lineId, "过时译文", result1!.sourceVersion);
    expect(applied).toBe(false);
    expect(doc.lines[0]!.chinese).toBeNull();
  });

  it("多条句子连续追加（不同 lineId）", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("First");
    doc.applyNmtResult(r1!.lineId, "第一", r1!.sourceVersion);
    const r2 = doc.appendOrRefine("Second");
    doc.applyNmtResult(r2!.lineId, "第二", r2!.sourceVersion);
    const r3 = doc.appendOrRefine("Third");
    doc.applyNmtResult(r3!.lineId, "第三", r3!.sourceVersion);

    expect(doc.lines).toHaveLength(3);
    expect(doc.translatedCount).toBe(3);
    expect(r1!.lineId).not.toBe(r2!.lineId);
    expect(r2!.lineId).not.toBe(r3!.lineId);
  });

  it("appendOrRefine 修正末行（startsWith 前缀匹配）", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("I love");
    expect(r1).not.toBeNull();
    const r2 = doc.appendOrRefine("I love you");
    expect(r2).not.toBeNull();
    expect(r2!.lineId).toBe(r1!.lineId);
    expect(r2!.sourceVersion).toBe(2);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.english).toBe("I love you");
  });

  it("appendOrRefine 完全重复返回 null", () => {
    const doc = LiveDocument.create("test");
    doc.appendOrRefine("Hello");
    const result = doc.appendOrRefine("Hello");
    expect(result).toBeNull();
    expect(doc.lines).toHaveLength(1);
  });

  it("applyRefineResult 批量 LLM 修正", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("I love you");
    doc.applyNmtResult(r1!.lineId, "我喜欢你", r1!.sourceVersion);

    doc.applyRefineResult([
      { lineId: r1!.lineId, oldChinese: "我喜欢你", newChinese: "我爱你" },
    ]);

    expect(doc.lines[0]!.chinese).toBe("我爱你");
    expect(doc.lines[0]!.status).toBe("corrected");
    expect(doc.version).toBe(1);
  });

  it("toMarkdown 输出标准格式（显示序号）", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("Hello");
    doc.applyNmtResult(r1!.lineId, "你好", r1!.sourceVersion);
    const r2 = doc.appendOrRefine("World");
    doc.applyNmtResult(r2!.lineId, "世界", r2!.sourceVersion);

    const md = doc.toMarkdown();
    // toMarkdown() 使用 **bold** 格式输出
    const line1en = "**[1] EN:** Hello";
    const line1zh = "**[1] ZH:** 你好";
    const line2en = "**[2] EN:** World";
    const line2zh = "**[2] ZH:** 世界";
    expect(md).toContain(line1en);
    expect(md).toContain(line1zh);
    expect(md).toContain(line2en);
    expect(md).toContain(line2zh);
    expect(md).not.toContain(r1!.lineId);
  });

  it("toMarkdown corrected 行追加 [已修复]", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("Hello");
    doc.applyNmtResult(r1!.lineId, "你好", r1!.sourceVersion);
    doc.applyRefineResult([
      { lineId: r1!.lineId, oldChinese: "你好", newChinese: "您好" },
    ]);

    const md = doc.toMarkdown();
    expect(md).toContain("[已修复]");
  });

  it("translatedCount 正确计数", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("A");
    doc.applyNmtResult(r1!.lineId, "甲", r1!.sourceVersion);
    doc.appendOrRefine("B");
    const r3 = doc.appendOrRefine("C");
    doc.applyNmtResult(r3!.lineId, "丙", r3!.sourceVersion);

    expect(doc.translatedCount).toBe(2);
  });

  it("getLine 按 lineId 查找", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("Hello");
    expect(r1).not.toBeNull();
    const line = doc.getLine(r1!.lineId);
    expect(line).toBeDefined();
    expect(line!.english).toBe("Hello");
  });

  it("exportVisible 包含 lines 和 pendingEnglish", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("A");
    doc.applyNmtResult(r1!.lineId, "甲", r1!.sourceVersion);
    doc.updatePartialEnglish("incoming...");

    const snap = doc.exportVisible();
    expect(snap.lines).toHaveLength(1);
    expect(snap.pendingEnglish).toBe("incoming...");
    expect(snap.version).toBe(0);
  });
});

// ── Phase 2 测试 ──

describe("LiveDocument Phase 2", () => {
  it("hideLine 隐藏行", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("Hello");
    expect(r1).not.toBeNull();
    expect(doc.lines).toHaveLength(1);

    doc.hideLine(r1!.lineId, "mg_test");
    expect(doc.lines).toHaveLength(0); // 隐藏后不出现在可见行中
    expect(doc.totalCount).toBe(1);    // 但仍在内部存在
  });

  it("unhideLine 恢复隐藏行", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("Hello");
    doc.hideLine(r1!.lineId, "mg_test");
    expect(doc.lines).toHaveLength(0);

    doc.unhideLine(r1!.lineId);
    expect(doc.lines).toHaveLength(1);
  });

  it("appendOrRefine 能够找到并修正 hidden 行", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("I can hear");
    doc.hideLine(r1!.lineId, "mg_test");

    // ASR 继续修正同一个句子（行已 hidden）
    const r2 = doc.appendOrRefine("I can hear the leaves");
    expect(r2).not.toBeNull();
    expect(r2!.lineId).toBe(r1!.lineId); // 同一 lineId
    expect(r2!.sourceVersion).toBe(2);    // sourceVersion 递增
    expect(doc.lines).toHaveLength(0);    // 仍 hidden

    // 恢复后可见
    doc.unhideLine(r1!.lineId);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.english).toBe("I can hear the leaves");
  });

  it("appendOrRefine hidden 行修正后不影响其他可见行", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("Visible line");
    doc.applyNmtResult(r1!.lineId, "可见行", r1!.sourceVersion);
    const r2 = doc.appendOrRefine("Hidden line");
    doc.hideLine(r2!.lineId, "mg_test");

    // 可见行独立存在
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.english).toBe("Visible line");

    // ASR 修正 hidden 行
    doc.appendOrRefine("Hidden line extended");
    expect(doc.lines).toHaveLength(1); // visible unchanged
  });

  it("toMarkdown 跳过 hidden 行且重新编号", () => {
    const doc = LiveDocument.create("test");
    const r1 = doc.appendOrRefine("A");
    doc.applyNmtResult(r1!.lineId, "甲", r1!.sourceVersion);
    const r2 = doc.appendOrRefine("B");
    doc.applyNmtResult(r2!.lineId, "乙", r2!.sourceVersion);
    const r3 = doc.appendOrRefine("C");
    doc.applyNmtResult(r3!.lineId, "丙", r3!.sourceVersion);

    // 隐藏第 2 行
    doc.hideLine(r2!.lineId, "mg_test");

    const md = doc.toMarkdown();
    // 可见行重编号：A→[1], C→[2]
    expect(md).toContain("**[1] EN:** A");
    expect(md).toContain("**[2] EN:** C");
    // 隐藏行以 HTML 注释保留
    expect(md).toContain("<!-- merged");
    expect(md).toContain("EN: B");
    // 渲染后的 EN 行中不包含 B（B 只在注释中）
    const visibleLines = md.split("\n").filter((l) => !l.startsWith("<!--"));
    expect(visibleLines.join("\n")).not.toContain("EN:** B");
  });
});
