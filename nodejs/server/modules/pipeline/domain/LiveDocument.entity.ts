// LiveDocument.entity.ts — 转录文档聚合根（Phase 1）
//
// 核心变化 vs TranscriptDocument.entity.ts：
//   - 内部存储：Map<lineId, LiveLine> + ordered string[]（稳定身份）
//   - appendOrRefine() 返回 { lineId, sourceVersion } 供 NMT 调度器使用
//   - applyNmtResult() 委托给 LiveLine.applyNmt()（陈旧守卫内置于实体）
//   - applyRefineResult() 批量应用 LLM 修正
//   - toMarkdown() 使用显示序号（displayIndex），非内部 lineId
//   - Phase 2 合并前置：hidden 行不出现在 toMarkdown 输出中
//
// 不变式：
//   1. #order 中的每个 id 都在 #linesById 中有对应的 LiveLine
//   2. LiveLine.id 在整个生命周期中不变

import { LiveLine, type LiveLineSnapshot } from "./LiveLine.entity";
import type { LineStatus } from "./LiveLine.entity";

// ── 内部快照结构（用于持久化）──

export interface LiveDocumentSnapshot {
  readonly id: string;
  readonly version: number;
  readonly order: readonly string[];
  readonly lines: readonly LiveLineSnapshot[];
}

// ── LLM 修正差异（输出给聚合根应用）──

export interface LiveLineRefinementDiff {
  readonly lineId: string;
  readonly oldChinese: string;
  readonly newChinese: string;
}

export class LiveDocument {
  readonly id: string;
  #linesById = new Map<string, LiveLine>();
  #order: string[] = [];
  #version = 0;
  #pendingEnglish = "";

  private constructor(id: string) {
    this.id = id;
  }

  /** 工厂方法：创建空文档 */
  static create(sessionId: string): LiveDocument {
    return new LiveDocument(sessionId);
  }

  /** 从持久化快照重建文档 */
  static fromSnapshot(snap: LiveDocumentSnapshot): LiveDocument {
    const doc = new LiveDocument(snap.id);
    doc.#version = snap.version;
    for (const ls of snap.lines) {
      const line = LiveLine.fromSnapshot(ls);
      doc.#linesById.set(line.id, line);
    }
    doc.#order = [...snap.order];
    return doc;
  }

  // ── 访问器 ──

  get version(): number { return this.#version; }
  get pendingEnglish(): string { return this.#pendingEnglish; }

  /** 可见行列表（按显示顺序，跳过 hidden 行） */
  get lines(): readonly LiveLine[] {
    return this.#order
      .map((id) => this.#linesById.get(id))
      .filter((l): l is LiveLine => l != null && !l.hidden);
  }

  /** 全部行数（含 hidden） */
  get totalCount(): number { return this.#order.length; }

  /** 获取指定 ID 的行（可能返回 hidden 行） */
  getLine(lineId: string): LiveLine | undefined {
    return this.#linesById.get(lineId);
  }

  // ── ASR partial ──

  /** ASR partial → 更新未落盘的实时英文 */
  updatePartialEnglish(text: string): void {
    this.#pendingEnglish = text;
  }

  // ── ASR final ──

  /**
   * ASR final → 追加新行或修正已有行（含 hidden 行）。
   *
   * 去重策略（Phase 2 扩展）：
   *   - 从后向前遍历全部行（含 hidden），寻找前缀匹配
   *   - 若新文本以某行英文为前缀 → 修正该行（refineEnglish，留在原 lineId）
   *   - 完全相同 → 跳过（返回 null）
   *   - 无匹配 → 创建新 LiveLine
   *
   * Phase 2 关键：hidden 行也可被 ASR 修正。
   * 修正后 sourceVersion++，MergeGroupManager 检测脏 → 丢弃合并组。
   *
   * @returns { lineId, sourceVersion } 供 NMT 触发，或 null（完全重复）
   */
  appendOrRefine(text: string): { lineId: string; sourceVersion: number } | null {
    const cleanText = text.trim();
    if (!cleanText) return null;

    // Phase 2: 从后向前遍历全部行寻找前缀匹配（含 hidden 行）
    for (let i = this.#order.length - 1; i >= 0; i--) {
      const id = this.#order[i]!;
      const line = this.#linesById.get(id);
      if (!line) continue;
      if (!cleanText.startsWith(line.english)) continue;

      if (cleanText === line.english) {
        // 完全重复 → 跳过
        return null;
      }
      // 修正版本：更新英文 + sourceVersion
      process.stderr.write(
        `[Doc] refine line ${line.id.slice(0, 8)}` +
        `${line.hidden ? " (hidden)" : ""}: "${cleanText.slice(0, 60)}"\n`,
      );
      line.refineEnglish(cleanText);
      this.#pendingEnglish = "";
      return { lineId: line.id, sourceVersion: line.sourceVersion };
    }

    // 新句子
    const line = LiveLine.create(cleanText);
    this.#linesById.set(line.id, line);
    this.#order.push(line.id);
    this.#pendingEnglish = "";
    return { lineId: line.id, sourceVersion: line.sourceVersion };
  }

  /** Phase 2：隐藏指定行（标记为已合并） */
  hideLine(lineId: string, mergedIntoGroupId: string): boolean {
    const line = this.#linesById.get(lineId);
    if (!line) return false;
    line.hide(mergedIntoGroupId);
    return true;
  }

  /** Phase 2：取消隐藏指定行（合并组过期丢弃时恢复） */
  unhideLine(lineId: string): boolean {
    const line = this.#linesById.get(lineId);
    if (!line) return false;
    line.unhide();
    return true;
  }

  // ── NMT ──

  /**
   * NMT 翻译完成 → 填充中文（委托 LiveLine 陈旧守卫）。
   *
   * @param lineId                 目标行 ID
   * @param chinese                NMT 返回的译文
   * @param expectedSourceVersion  发起翻译时的 sourceVersion
   * @returns true=已应用，false=陈旧丢弃
   */
  applyNmtResult(lineId: string, chinese: string, expectedSourceVersion: number): boolean {
    const line = this.#linesById.get(lineId);
    if (!line) return false;
    return line.applyNmt(chinese, expectedSourceVersion);
  }

  // ── LLM 修正 ──

  /**
   * LLM 全文修正 → 批量更新中文。
   *
   * @param diffs  变更列表（来自 TranscriptDiffEngine.diff()）
   */
  applyRefineResult(diffs: readonly LiveLineRefinementDiff[]): void {
    for (const diff of diffs) {
      const line = this.#linesById.get(diff.lineId);
      if (line) {
        line.applyRefinement(diff.newChinese);
      }
    }
    if (diffs.length > 0) {
      this.#version++;
    }
  }

  // ── 已翻译计数 ──

  /** 已翻译的可见行数 */
  get translatedCount(): number {
    let count = 0;
    for (const id of this.#order) {
      const line = this.#linesById.get(id);
      if (line && !line.hidden && line.chinese != null) {
        count++;
      }
    }
    return count;
  }

  // ── Markdown 渲染 ──

  /**
   * 导出为 markdown 格式。
   * 格式（每句一组，硬换行分隔，空行隔段）：
   *   **[1] EN:** Hello world··
   *   **[1] ZH:** 你好世界
   *
   *   注意：
   *   - 行号是显示序号（从 1 开始），非内部 lineId
   *   - EN 行末尾有两个空格（markdown 硬换行）
   *   - hidden 行被跳过（Phase 2 合并支持）
   *   - corrected 行追加 [已修复] 标记
   */
  toMarkdown(): string {
    const parts: string[] = [];
    let displayIndex = 0;
    for (const id of this.#order) {
      const line = this.#linesById.get(id);
      if (!line) continue;

      if (line.hidden) {
        // Phase 2：隐藏行以 HTML 注释保留在 .md 文件中
        const zhPart = line.chinese ?? "*(翻译中...)*";
        const mergeNote = line.mergedInto
          ? ` → merged into ${line.mergedInto.slice(0, 8)}`
          : "";
        parts.push(
          `<!-- merged${mergeNote}: EN: ${line.english} -->`,
        );
        if (line.chinese) {
          parts.push(`<!--                ZH: ${zhPart} -->`);
        }
        parts.push("");
        continue;
      }

      displayIndex++;
      let zhText: string = line.chinese ?? "*(翻译中...)*";
      if (line.status === "corrected" && zhText) {
        zhText += "[已修复]";
      }
      parts.push(`**[${displayIndex}] EN:** ${line.english}  `);
      parts.push(`**[${displayIndex}] ZH:** ${zhText}`);
      parts.push(""); // 空行分隔
    }
    return parts.join("\n").trim();
  }

  // ── 快照导出 ──

  /** 导出完整快照（用于持久化） */
  toSnapshot(): LiveDocumentSnapshot {
    return {
      id: this.id,
      version: this.#version,
      order: [...this.#order],
      lines: [...this.#linesById.values()].map((l) => l.toSnapshot()),
    };
  }

  /** 导出前端可见快照 */
  exportVisible(): { lines: readonly LiveLineSnapshot[]; version: number; pendingEnglish: string } {
    return {
      lines: this.lines.map((l) => l.toSnapshot()),
      version: this.#version,
      pendingEnglish: this.#pendingEnglish,
    };
  }
}
