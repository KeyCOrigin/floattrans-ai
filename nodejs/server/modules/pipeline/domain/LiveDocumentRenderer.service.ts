// LiveDocumentRenderer.service.ts — 文档渲染领域服务
//
// 职责：从 LiveDocument 内存状态渲染 Markdown（纯视图，非真相源）。
// 比 TranscriptDocument.toMarkdown() 独立出来的好处：
//   1. 渲染逻辑（displayIndex 分配、hidden 跳过）集中在一处
//   2. Phase 2 合并行渲染（MergeGroup 代表行替换多行）在此实现
//   3. 不修改文档状态，纯函数式转换
//
// Phase 1: 基本渲染（等同 LiveDocument.toMarkdown()）
// Phase 2: 合并组感知渲染（看到 MergeGroup → 输出合并后代表行）

import type { LiveDocument } from "./LiveDocument.entity";
import type { LiveLine } from "./LiveLine.entity";

/** 渲染行：内部 lineId + 显示序号 + 渲染文本 */
export interface RenderedLine {
  readonly lineId: string;
  readonly displayIndex: number;
  readonly english: string;
  readonly chinese: string | null;
  readonly status: string;
}

export class LiveDocumentRenderer {
  /**
   * 渲染完整的 Markdown 文档。
   * 格式与 TranscriptDocument.toMarkdown() 兼容。
   */
  render(doc: LiveDocument): string {
    const rendered = this.renderLines(doc);
    const parts: string[] = [];
    for (const r of rendered) {
      let zhText: string = r.chinese ?? "*(翻译中...)*";
      if (r.status === "corrected" && zhText) {
        zhText += "[已修复]";
      }
      parts.push(`**[${r.displayIndex}] EN:** ${r.english}  `);
      parts.push(`**[${r.displayIndex}] ZH:** ${zhText}`);
      parts.push("");
    }
    return parts.join("\n").trim();
  }

  /**
   * 渲染行列表（含 displayIndex）。
   * Phase 2 扩展：合并组感知（看到合并组 → 输出代表行）。
   */
  renderLines(doc: LiveDocument): readonly RenderedLine[] {
    const result: RenderedLine[] = [];
    let displayIndex = 0;
    for (const line of doc.lines) {
      displayIndex++;
      result.push({
        lineId: line.id,
        displayIndex,
        english: line.english,
        chinese: line.chinese,
        status: line.status,
      });
    }
    return result;
  }
}
