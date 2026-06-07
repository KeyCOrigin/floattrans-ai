// TranscriptDocument.entity.ts — 转录文档聚合根
// 管理完整的对话记录：英文→中文逐行追加，LLM 全量修正
// 所有字段 private，变更仅通过具名业务方法

import type { TranscriptLine, TranscriptLineStatus } from "./TranscriptLine.value-object";
import type { TranscriptSnapshot } from "./TranscriptSnapshot.value-object";

export interface CorrectionDiff {
  readonly lineNumber: number;
  readonly oldChinese: string;
  readonly newChinese: string;
}

export class TranscriptDocument {
  readonly id: string;
  #lines: TranscriptLine[] = [];
  #version = 0;
  #counter = 0;
  /** ASR partial 尚未 final 的最后一行英文（不持久化、不进入 snapshot lines） */
  #pendingEnglish = "";

  private constructor(id: string) {
    this.id = id;
  }

  static create(sessionId: string): TranscriptDocument {
    return new TranscriptDocument(sessionId);
  }

  get lines(): readonly TranscriptLine[] { return this.#lines; }
  get version(): number { return this.#version; }
  get pendingEnglish(): string { return this.#pendingEnglish; }

  /** ASR partial → 更新未落盘的实时英文（前端实时显示） */
  updatePartialEnglish(text: string): void {
    this.#pendingEnglish = text;
  }

  /**
   * ASR final → 锁定 pending english 为正式行，清空 pending，返回新行号。
   * 调用方收到行号后触发 NMT 翻译。
   *
   * 去重策略：若新文本以最后一行英文为前缀（ASR 持续修正同一句），
   * 则原地更新该行而非新增，避免同一句话被多次翻译产生重复行。
   */
  appendFinalEnglish(text: string): number {
    const cleanText = text.trim();
    if (!cleanText) return -1;

    // 检查是否是最后一行的修正版本
    const lastLine = this.#lines[this.#lines.length - 1];
    if (lastLine && cleanText.startsWith(lastLine.english)) {
      if (cleanText === lastLine.english) {
        // 完全重复 → 跳过
        return -1;
      }
      // 修正版本：用新不可变对象替换旧行（保持相同 lineNumber）
      process.stderr.write(`[Doc] refine line #${lastLine.lineNumber}: ${cleanText.slice(0, 60)}\n`);
      this.#lines[this.#lines.length - 1] = {
        lineNumber: lastLine.lineNumber,
        english: cleanText,
        chinese: null,
        status: "pending",
      };
      this.#pendingEnglish = "";
      return lastLine.lineNumber;
    }

    // 新句子
    this.#counter++;
    const line: TranscriptLine = {
      lineNumber: this.#counter,
      english: cleanText,
      chinese: null,
      status: "pending",
    };
    this.#lines.push(line);
    this.#pendingEnglish = "";
    return line.lineNumber;
  }

  /** NMT 完成 → 填充中文 */
  setChinese(lineNumber: number, chinese: string): boolean {
    const line = this.#lines.find((l) => l.lineNumber === lineNumber);
    if (!line) return false;
    line.chinese = chinese;
    line.status = "translated";
    return true;
  }

  /** LLM 修正 → 批量更新中文，返回变更列表供前端高亮 */
  applyLLMCorrection(correctedLines: readonly TranscriptLine[]): CorrectionDiff[] {
    const diffs: CorrectionDiff[] = [];

    for (const corrected of correctedLines) {
      const existing = this.#lines.find((l) => l.lineNumber === corrected.lineNumber);
      if (!existing) continue;
      if (existing.chinese !== corrected.chinese && corrected.chinese != null) {
        diffs.push({
          lineNumber: corrected.lineNumber,
          oldChinese: existing.chinese ?? "",
          newChinese: corrected.chinese,
        });
        existing.chinese = corrected.chinese;
        existing.status = "corrected";
      }
    }

    if (diffs.length > 0) {
      this.#version++;
    }
    return diffs;
  }

  /**
   * 导出为 markdown 格式，供前端 react-markdown 渲染和 LLM 读取。
   * 格式（每句一组，硬换行分隔，空行隔段）：
   *   **[1] EN:** Hello world··
   *   **[1] ZH:** 你好世界
   *
   *   **[2] EN:** I am Chen··
   *   **[2] ZH:** 我是陈
   *
   * 注意：EN 行末尾有两个空格（markdown 硬换行）。
   */
  toMarkdown(): string {
    const parts: string[] = [];
    for (const line of this.#lines) {
      let zhText = line.chinese ?? "*(翻译中...)*";
      // LLM 修正过的行追加 [已修复] 标记，供前端高亮
      if (line.status === "corrected" && zhText) {
        zhText += "[已修复]";
      }
      parts.push(`**[${line.lineNumber}] EN:** ${line.english}  `);
      parts.push(`**[${line.lineNumber}] ZH:** ${zhText}`);
      parts.push(""); // 空行分隔
    }
    return parts.join("\n").trim();
  }

  /** 导出前端快照（含已确认行 + pending 英文） */
  toSnapshot(): TranscriptSnapshot {
    return {
      lines: [...this.#lines],
      version: this.#version,
      pendingEnglish: this.#pendingEnglish,
    };
  }

  /** 已翻译的行数（含 NMT 和 LLM 修正后） */
  get translatedCount(): number {
    return this.#lines.filter((l) => l.chinese != null).length;
  }
}
