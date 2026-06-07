// TranscriptDocument.test.ts — 转录文档聚合根测试

import { describe, it, expect } from "vitest";
import { TranscriptDocument } from "../TranscriptDocument.entity";

describe("TranscriptDocument", () => {
  it("create 返回空文档", () => {
    const doc = TranscriptDocument.create("test-session");
    expect(doc.id).toBe("test-session");
    expect(doc.lines).toHaveLength(0);
    expect(doc.version).toBe(0);
    expect(doc.pendingEnglish).toBe("");
  });

  it("updatePartialEnglish 更新 pending english", () => {
    const doc = TranscriptDocument.create("test");
    doc.updatePartialEnglish("Hello");
    expect(doc.pendingEnglish).toBe("Hello");
    doc.updatePartialEnglish("Hello world");
    expect(doc.pendingEnglish).toBe("Hello world");
    expect(doc.lines).toHaveLength(0); // 未落盘
  });

  it("appendFinalEnglish 锁定行并清空 pending", () => {
    const doc = TranscriptDocument.create("test");
    doc.updatePartialEnglish("Hello world today");
    const ln = doc.appendFinalEnglish("Hello world today");
    expect(ln).toBe(1);
    expect(doc.pendingEnglish).toBe("");
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.english).toBe("Hello world today");
    expect(doc.lines[0]!.chinese).toBeNull();
    expect(doc.lines[0]!.status).toBe("pending");
  });

  it("setChinese 填充中文", () => {
    const doc = TranscriptDocument.create("test");
    doc.appendFinalEnglish("Hello");
    doc.setChinese(1, "你好");
    expect(doc.lines[0]!.chinese).toBe("你好");
    expect(doc.lines[0]!.status).toBe("translated");
  });

  it("多条句子连续追加", () => {
    const doc = TranscriptDocument.create("test");
    doc.appendFinalEnglish("First");
    doc.setChinese(1, "第一");
    doc.appendFinalEnglish("Second");
    doc.setChinese(2, "第二");
    doc.appendFinalEnglish("Third");
    doc.setChinese(3, "第三");

    expect(doc.lines).toHaveLength(3);
    expect(doc.translatedCount).toBe(3);
  });

  it("applyLLMCorrection 修正中文并返回 diff", () => {
    const doc = TranscriptDocument.create("test");
    doc.appendFinalEnglish("I love you");
    doc.setChinese(1, "我喜欢你");

    const diffs = doc.applyLLMCorrection([
      { lineNumber: 1, english: "I love you", chinese: "我爱你", status: "corrected" as const },
    ]);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.oldChinese).toBe("我喜欢你");
    expect(diffs[0]!.newChinese).toBe("我爱你");
    expect(doc.version).toBe(1);
    expect(doc.lines[0]!.chinese).toBe("我爱你");
  });

  it("toMarkdown 输出标准格式", () => {
    const doc = TranscriptDocument.create("test");
    doc.appendFinalEnglish("Hello");
    doc.setChinese(1, "你好");
    doc.appendFinalEnglish("World");
    doc.setChinese(2, "世界");

    const md = doc.toMarkdown();
    expect(md).toContain("[1] EN: Hello");
    expect(md).toContain("[1] ZH: 你好");
    expect(md).toContain("[2] EN: World");
    expect(md).toContain("[2] ZH: 世界");
  });

  it("toSnapshot 包含 lines 和 pendingEnglish", () => {
    const doc = TranscriptDocument.create("test");
    doc.appendFinalEnglish("A");
    doc.setChinese(1, "甲");
    doc.updatePartialEnglish("incoming...");

    const snap = doc.toSnapshot();
    expect(snap.lines).toHaveLength(1);
    expect(snap.pendingEnglish).toBe("incoming...");
    expect(snap.version).toBe(0);
  });
});
