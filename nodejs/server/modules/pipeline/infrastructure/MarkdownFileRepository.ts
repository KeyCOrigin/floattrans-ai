// MarkdownFileRepository.ts — 转录文档持久化（.md 文件）（Phase 1）
// 实现 ITranscriptRepository，写入 nodejs/server/sessions/ 目录
//
// Phase 1 变化：
//   - TranscriptDocument → LiveDocument
//   - save() 调用 doc.toMarkdown()
//   - load() 解析 .md 生成新 LiveLine（新 UUID），不保留原始 lineId
//   - 异步串行化写入，避免并发 NMT 完成时同时写文件导致竞态

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ITranscriptRepository } from "../domain/ITranscriptRepository.port";
import { LiveDocument } from "../domain/LiveDocument.entity";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_DIR = path.resolve(__dirname, "../../../sessions");

// 确保目录存在
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export class MarkdownFileRepository implements ITranscriptRepository {
  /** 写入串行化 Promise 链，保证同文件不会并发写入 */
  #writeChain = Promise.resolve();

  save(doc: LiveDocument): void {
    const filePath = this.getFilePath(doc.id);
    const markdown = doc.toMarkdown();

    // 异步串行化：前一次写入完成后才开始下一次
    this.#writeChain = this.#writeChain.then(() => {
      return fs.promises.writeFile(filePath, markdown, "utf-8");
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[MarkdownRepo] write failed: ${message}\n`);
    });
  }

  load(sessionId: string): LiveDocument | null {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) return null;

    const doc = LiveDocument.create(sessionId);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // 兼容两种格式：[N] 和 **[N]**
    const LINE_RE = /^\*{0,2}\[(\d+)\]\s+(EN|ZH):\*{0,2}\s*(.+)$/;

    const map = new Map<number, { english: string; chinese: string | null; status: string }>();
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const match = trimmed.match(LINE_RE);
      if (!match) continue;
      const ln = parseInt(match[1]!, 10);
      const lang = match[2]!;
      const text = match[3]!
        .replace(/\[已修复\]\s*$/, "")  // 剥离 [已修复] 标记
        .trim();

      let entry = map.get(ln);
      if (!entry) { entry = { english: "", chinese: null, status: "pending" }; map.set(ln, entry); }
      if (lang === "EN") {
        entry.english = text;
      } else {
        // 检测 LLM 修正标记
        if (match[3]!.includes("[已修复]")) {
          entry.status = "corrected";
        }
        entry.chinese = text !== "*(翻译中...)*" ? text : null;
        if (entry.chinese !== null && entry.status === "pending") {
          entry.status = "translated";
        }
      }
    }

    // 按行号顺序重建
    for (const [, entry] of [...map.entries()].sort(([a], [b]) => a - b)) {
      const result = doc.appendOrRefine(entry.english);
      if (result && entry.chinese) {
        doc.applyNmtResult(result.lineId, entry.chinese, result.sourceVersion);
      }
      // 如果原是 corrected，重新标记（简化处理）
      if (result && entry.status === "corrected") {
        const line = doc.getLine(result.lineId);
        if (line && line.chinese === entry.chinese) {
          line.applyRefinement(entry.chinese!);
        }
      }
    }

    return doc;
  }

  getFilePath(sessionId: string): string {
    return path.join(SESSIONS_DIR, `${sessionId}.md`);
  }
}
