// TranscriptDiffEngine.service.ts — LLM 修正结果 diff 引擎（Phase 1）
//
// 领域服务：解析 LLM 返回的全文，比对出变更行。
//
// Phase 1 变化：
//   - 移除 parseFullDocument()（旧 rebuild 路径已删除）
//   - diff() 接受 LiveLine[] 替代 TranscriptLine[]，返回 LiveLineRefinementDiff[]
//   - 匹配策略：按位置（visible order index），不再依赖 lineNumber
//   - 兼容 **bold** 包裹的 markdown 格式（toMarkdown() 输出）

import type { LiveLine } from "./LiveLine.entity";
import type { LiveLineRefinementDiff } from "./LiveDocument.entity";

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

/** Phase 2：LLM 合并检测结果 */
export interface MergeDetection {
  /** 代表行 ID（保持可见的最完整版本） */
  readonly representativeLineId: string;
  /** 被合并的行 ID（将被隐藏的增量版本） */
  readonly mergedLineIds: readonly string[];
}

export class TranscriptDiffEngine {
  /**
   * 解析 LLM 返回的修正后 markdown 全文。
   * 返回解析后的行列表（按 lineNumber 去重合并 + 排序）。
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
      // 去除 LLM 误追加的多余 markdown bold 标记
      // 同时剥离 [已修复] 标记（toMarkdown() 对 corrected 行追加，LLM 原样回传造成假 diff）
      const rawText = match[3]!;
      const text = rawText
        .replace(/^\*{1,2}/, "")
        .replace(/\*{1,2}$/, "")
        .replace(/\[已修复\]\s*$/, "")
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
   * 比对原文（LiveLine[] 可见行）与 LLM 修正结果（ParsedTranscriptLine[]）。
   *
   * 匹配策略：按位置（index in visible order），因为 Phase 1 LLM 不做行合并。
   * LLM 返回可能行数不一致（偶发合并），此时仅比对 min(len) 行。
   *
   * @returns 仅包含中文有变化的行的 diff 列表
   */
  diff(
    originals: readonly LiveLine[],
    corrected: readonly ParsedTranscriptLine[],
  ): LiveLineRefinementDiff[] {
    const result: LiveLineRefinementDiff[] = [];
    const limit = Math.min(originals.length, corrected.length);

    for (let i = 0; i < limit; i++) {
      const orig = originals[i]!;
      const corr = corrected[i]!;
      if (
        orig.chinese !== corr.chinese &&
        corr.chinese != null &&
        corr.chinese !== "(翻译中...)"
      ) {
        result.push({
          lineId: orig.id,
          oldChinese: orig.chinese ?? "",
          newChinese: corr.chinese,
        });
      }
    }

    return result;
  }

  /**
   * Phase 2：检测 LLM 合并了哪些行。
   *
   * 当 LLM 返回行数少于原文时，通过英文匹配找出合并关系。
   *
   * 匹配策略（v2——解决精确匹配失败问题）：
   *   1. 对英文文本做规范化处理（trim + 合并连续空格）
   *   2. 优先精确匹配 → 回退前缀匹配（原英文≥15字符且是 parsed 英文的前缀）
   *   3. 前缀匹配解决：LLM 可能微调标点、尾部空格被 strip 等问题
   *   4. 无法匹配的 parsed 行 → 跳过（不阻塞后续检测）
   *
   * @param originals  原始可见行列表
   * @param parsed      LLM 返回的解析后行列表
   * @returns 合并检测结果数组（空数组表示无合并）
   */
  detectMerges(
    originals: readonly LiveLine[],
    parsed: readonly ParsedTranscriptLine[],
  ): MergeDetection[] {
    if (parsed.length >= originals.length) return [];

    const merges: MergeDetection[] = [];
    let origIdx = 0;

    for (let parsedIdx = 0; parsedIdx < parsed.length; parsedIdx++) {
      const p = parsed[parsedIdx]!;
      const pNorm = normalizeEnglish(p.english);
      let matchIdx = -1;

      // 第一轮：规范化后精确匹配
      for (let k = origIdx; k < originals.length; k++) {
        if (normalizeEnglish(originals[k]!.english) === pNorm) {
          matchIdx = k;
          break;
        }
      }

      // 第二轮：前缀匹配（原英文是 parsed 英文的前缀，最小长度 15 字符）
      if (matchIdx < 0) {
        for (let k = origIdx; k < originals.length; k++) {
          const origNorm = normalizeEnglish(originals[k]!.english);
          if (origNorm.length >= 15 && pNorm.startsWith(origNorm)) {
            matchIdx = k;
            process.stderr.write(
              `[DiffEngine] prefix match: ` +
              `"${origNorm.slice(0, 40)}" ← "${pNorm.slice(0, 40)}"\n`,
            );
            break;
          }
        }
      }

      if (matchIdx < 0) {
        // 无法匹配 → 跳过此行，不阻塞后续检测
        process.stderr.write(
          `[DiffEngine] no match for parsed#${parsedIdx}: "${pNorm.slice(0, 60)}"\n`,
        );
        continue;
      }

      // 两个匹配之间存在 gap → 产生了合并
      if (matchIdx > origIdx) {
        const mergedLineIds = originals
          .slice(origIdx, matchIdx)
          .map((l) => l.id);
        merges.push({
          representativeLineId: originals[matchIdx]!.id,
          mergedLineIds,
        });
        process.stderr.write(
          `[DiffEngine] merge detected: lines ${origIdx + 1}-${matchIdx} ` +
          `→ rep ${originals[matchIdx]!.id.slice(0, 8)} (${mergedLineIds.length} hidden)\n`,
        );
      }

      origIdx = matchIdx + 1;
    }

    return merges;
  }
}

/** 规范化英文文本用于匹配比较 */
function normalizeEnglish(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}
