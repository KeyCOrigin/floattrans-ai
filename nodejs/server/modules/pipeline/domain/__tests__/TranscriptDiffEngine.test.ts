// TranscriptDiffEngine.test.ts — 修正 diff 引擎测试（Phase 1）
// 适配 LiveLine 实体和 LiveLineRefinementDiff 返回类型

import { describe, it, expect } from "vitest";
import { TranscriptDiffEngine } from "../TranscriptDiffEngine.service";
import { LiveLine } from "../LiveLine.entity";

describe("TranscriptDiffEngine", () => {
  const engine = new TranscriptDiffEngine();

  it("parse 解析标准格式", () => {
    const md = `[1] EN: Hello
[1] ZH: 你好

[2] EN: World
[2] ZH: 世界`;

    const result = engine.parse(md);
    expect(result).toHaveLength(2);
    expect(result[0]!.lineNumber).toBe(1);
    expect(result[0]!.english).toBe("Hello");
    expect(result[0]!.chinese).toBe("你好");
    expect(result[1]!.lineNumber).toBe(2);
    expect(result[1]!.english).toBe("World");
    expect(result[1]!.chinese).toBe("世界");
  });

  it("diff 找出中文变更的行（按位置匹配）", () => {
    const line1 = LiveLine.create("Hello");
    line1.applyNmt("你好", line1.sourceVersion);
    const line2 = LiveLine.create("World");
    line2.applyNmt("世界", line2.sourceVersion);
    const line3 = LiveLine.create("Goodbye");
    line3.applyNmt("再见", line3.sourceVersion);

    const originals = [line1, line2, line3];

    const corrected = engine.parse(`[1] EN: Hello
[1] ZH: 你好

[2] EN: World
[2] ZH: 全世界

[3] EN: Goodbye
[3] ZH: 再见`);

    const diffs = engine.diff(originals, corrected);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.lineId).toBe(line2.id);
    expect(diffs[0]!.oldChinese).toBe("世界");
    expect(diffs[0]!.newChinese).toBe("全世界");
  });

  it("diff 无变更时返回空数组", () => {
    const line1 = LiveLine.create("Hi");
    line1.applyNmt("嗨", line1.sourceVersion);

    const originals = [line1];

    const corrected = engine.parse(`[1] EN: Hi
[1] ZH: 嗨`);

    const diffs = engine.diff(originals, corrected);
    expect(diffs).toHaveLength(0);
  });

  it("diff 跳过 '(翻译中...)' 占位符", () => {
    const line1 = LiveLine.create("Hello");
    // chinese 保持 null（未翻译）

    const originals = [line1];

    const corrected = engine.parse(`[1] EN: Hello
[1] ZH: (翻译中...)`);

    const diffs = engine.diff(originals, corrected);
    expect(diffs).toHaveLength(0);
  });

  it("parse 兼容 **[N] EN:** markdown bold 格式", () => {
    const md = `**[1] EN:** Hello  
**[1] ZH:** 你好

**[2] EN:** World  
**[2] ZH:** 世界`;

    const result = engine.parse(md);
    expect(result).toHaveLength(2);
    expect(result[0]!.english).toBe("Hello");
    expect(result[0]!.chinese).toBe("你好");
  });

  it("diff 按位置匹配（行数不一致时仅比对共同部分）", () => {
    const line1 = LiveLine.create("A");
    line1.applyNmt("甲", line1.sourceVersion);
    const line2 = LiveLine.create("B");
    line2.applyNmt("乙", line2.sourceVersion);

    const originals = [line1, line2];

    // LLM 返回 3 行（多了一行）
    const corrected = engine.parse(`[1] EN: A
[1] ZH: 甲改

[2] EN: B
[2] ZH: 乙

[3] EN: C
[3] ZH: 丙`);

    const diffs = engine.diff(originals, corrected);
    // 仅比对前 2 行（min(len)），第 1 行变化被检测
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.lineId).toBe(line1.id);
  });
});

// ── Phase 2: detectMerges 测试 ──

describe("TranscriptDiffEngine Phase 2", () => {
  const engine = new TranscriptDiffEngine();

  it("detectMerges 检测到连续行被合并", () => {
    // 场景：原始有 5 行，LLM 将第 2、3 行合并到第 3 行
    const line1 = LiveLine.create("First");
    const line2 = LiveLine.create("What you hear");
    const line3 = LiveLine.create("What you hear, I can hear");
    const line4 = LiveLine.create("Other sentence");
    const line5 = LiveLine.create("Last");
    const originals = [line1, line2, line3, line4, line5];

    // LLM 返回 4 行（合并了 2,3 → 3）
    const parsed = engine.parse(`[1] EN: First
[1] ZH: 第一

[2] EN: What you hear, I can hear
[2] ZH: 你听到的，我能听到

[3] EN: Other sentence
[3] ZH: 其他句子

[4] EN: Last
[4] ZH: 最后`);

    const merges = engine.detectMerges(originals, parsed);
    expect(merges).toHaveLength(1);
    expect(merges[0]!.representativeLineId).toBe(line3.id);
    expect(merges[0]!.mergedLineIds).toEqual([line2.id]);
  });

  it("detectMerges 无合并时返回空数组", () => {
    const line1 = LiveLine.create("A");
    const line2 = LiveLine.create("B");
    const line3 = LiveLine.create("C");
    const originals = [line1, line2, line3];

    const parsed = engine.parse(`[1] EN: A
[1] ZH: 甲

[2] EN: B
[2] ZH: 乙

[3] EN: C
[3] ZH: 丙`);

    const merges = engine.detectMerges(originals, parsed);
    expect(merges).toHaveLength(0);
  });

  it("detectMerges 多个合并组", () => {
    // 原始 6 行，LLM 将 (2,3)→3, (5,6)→6
    const l1 = LiveLine.create("A");
    const l2 = LiveLine.create("Incremental 1");
    const l3 = LiveLine.create("Incremental 1 complete");
    const l4 = LiveLine.create("B");
    const l5 = LiveLine.create("Incremental 2");
    const l6 = LiveLine.create("Incremental 2 complete");
    const originals = [l1, l2, l3, l4, l5, l6];

    const parsed = engine.parse(`[1] EN: A
[1] ZH: 甲

[2] EN: Incremental 1 complete
[2] ZH: 增量1完成

[3] EN: B
[3] ZH: 乙

[4] EN: Incremental 2 complete
[4] ZH: 增量2完成`);

    const merges = engine.detectMerges(originals, parsed);
    expect(merges).toHaveLength(2);
    expect(merges[0]!.representativeLineId).toBe(l3.id);
    expect(merges[0]!.mergedLineIds).toEqual([l2.id]);
    expect(merges[1]!.representativeLineId).toBe(l6.id);
    expect(merges[1]!.mergedLineIds).toEqual([l5.id]);
  });

  it("detectMerges 末尾有未匹配行时不崩溃", () => {
    // LLM 返回行数超少（只匹配了前2行）
    const l1 = LiveLine.create("A");
    const l2 = LiveLine.create("B");
    const l3 = LiveLine.create("C");
    const l4 = LiveLine.create("D");
    const originals = [l1, l2, l3, l4];

    const parsed = engine.parse(`[1] EN: A
[1] ZH: 甲

[2] EN: B
[2] ZH: 乙`);

    const merges = engine.detectMerges(originals, parsed);
    // 只匹配了前2行，3,4未匹配 → 无合并（因为没有第3个匹配点）
    expect(merges).toHaveLength(0);
  });
});
