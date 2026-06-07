// TranscriptDiffEngine.service.ts — LLM 修正结果 diff 引擎
// 领域服务：解析 LLM 返回的全文，比对出变更行

import type { TranscriptLine, TranscriptLineStatus } from "./TranscriptLine.value-object";

/**
 * LLM 返回格式解析正则。
 * 兼容两种格式：
 *   [1] EN: text          （LLM 原始返回）
 *   **[1] EN:** text      （markdown bold 包裹，toMarkdown() 输出）
 */
const LINE_RE = /^\*{0,2}\[(\d+)\]\s+(EN|ZH):\*{0,2}\s*(.+)$/;

export interface ParsedTranscriptLine {
  lineNumber: number;
  english: string;
  chinese: string | null;
}

export class TranscriptDiffEngine {
  /**
   * 解析 LLM 返回的修正后 markdown 全文。
   * 返回解析后的行列表（按 lineNumber 去重合并）。
   */
  parse(markdown: string): ParsedTranscriptLine[] {
    const lines = markdown.split("\n");
    const map = new Map<number, ParsedTranscriptLine>();

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const match = trimmed.match(LINE_RE);
      if (!match) continue;

      const lineNumber = parseInt(match[1]!, 10);
      const lang = match[2]!;
      // 去除 LLM 误追加的多余 markdown bold 标记（例如 LLM 试图"闭合"它看到的 **bold**）
      // 同时剥离 [已修复] 标记（toMarkdown() 对 corrected 行追加，但 LLM 会原样回传造成假 diff）
      // 输入示例："**火车在这里运行良好。**" → "火车在这里运行良好。"
      // 输入示例："你好世界[已修复]" → "你好世界"
      const rawText = match[3]!;
      const text = rawText
        .replace(/^\*{1,2}/, "")    // 去除开头的 * 或 **
        .replace(/\*{1,2}$/, "")    // 去除结尾的 * 或 **
        .replace(/\[已修复\]\s*$/, "")  // 去除行尾 [已修复]（防止回环累积）
        .trim();

      let entry = map.get(lineNumber);
      if (!entry) {
        entry = { lineNumber, english: "", chinese: null };
        map.set(lineNumber, entry);
      }

      if (lang === "EN") {
        entry.english = text;
      } else {
        entry.chinese = text;
      }
    }

    return [...map.values()].sort((a, b) => a.lineNumber - b.lineNumber);
  }

  /**
   * 比对原文与 LLM 修正结果，生成 TranscriptLine 列表。
   * 仅包含中文有变化的行。
   */
  diff(
    original: readonly TranscriptLine[],
    corrected: readonly ParsedTranscriptLine[],
  ): TranscriptLine[] {
    const result: TranscriptLine[] = [];
    const originalMap = new Map(original.map((l) => [l.lineNumber, l]));

    for (const c of corrected) {
      const orig = originalMap.get(c.lineNumber);
      if (!orig) continue;
      if (orig.chinese !== c.chinese && c.chinese != null && c.chinese !== "(翻译中...)") {
        result.push({
          lineNumber: c.lineNumber,
          english: c.english || orig.english,
          chinese: c.chinese,
          status: "corrected" as TranscriptLineStatus,
        });
      }
    }

    return result;
  }
}
