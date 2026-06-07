// TranscriptDiffEngine.test.ts — 修正 diff 引擎测试

import { describe, it, expect } from "vitest";
import { TranscriptDiffEngine } from "../TranscriptDiffEngine.service";

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

  it("diff 找出中文变更的行", () => {
    const original = [
      { lineNumber: 1, english: "Hello", chinese: "你好", status: "translated" as const },
      { lineNumber: 2, english: "World", chinese: "世界", status: "translated" as const },
      { lineNumber: 3, english: "Goodbye", chinese: "再见", status: "translated" as const },
    ];

    const corrected = engine.parse(`[1] EN: Hello
[1] ZH: 你好

[2] EN: World
[2] ZH: 全世界

[3] EN: Goodbye
[3] ZH: 再见`);

    const diffs = engine.diff(original, corrected);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.lineNumber).toBe(2);
    expect(diffs[0]!.chinese).toBe("全世界");
  });

  it("diff 无变更时返回空数组", () => {
    const original = [
      { lineNumber: 1, english: "Hi", chinese: "嗨", status: "translated" as const },
    ];

    const corrected = engine.parse(`[1] EN: Hi
[1] ZH: 嗨`);

    const diffs = engine.diff(original, corrected);
    expect(diffs).toHaveLength(0);
  });

  it("diff 跳过 '(翻译中...)' 占位符", () => {
    const original = [
      { lineNumber: 1, english: "Hello", chinese: null, status: "pending" as const },
    ];

    const corrected = engine.parse(`[1] EN: Hello
[1] ZH: (翻译中...)`);

    const diffs = engine.diff(original, corrected);
    expect(diffs).toHaveLength(0);
  });
});
