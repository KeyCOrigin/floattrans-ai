// MarkdownFileRepository.ts — 转录文档持久化（.md 文件）
// 实现 ITranscriptRepository，写入 nodejs/server/sessions/ 目录
//
// v2 改进：异步串行化写入，避免并发 NMT 完成时同时写文件导致竞态

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ITranscriptRepository } from "../domain/ITranscriptRepository.port";
import { TranscriptDocument } from "../domain/TranscriptDocument.entity";

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

  save(doc: TranscriptDocument): void {
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

  load(sessionId: string): TranscriptDocument | null {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    // 从文件重建文档（仅用于恢复会话，不用于实时管道）
    const doc = TranscriptDocument.create(sessionId);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const LINE_RE = /^\[(\d+)\]\s+(EN|ZH):\s+(.+)$/;

    const map = new Map<number, { english: string; chinese: string | null }>();
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const match = trimmed.match(LINE_RE);
      if (!match) continue;
      const ln = parseInt(match[1]!, 10);
      const lang = match[2]!;
      const text = match[3]!;

      let entry = map.get(ln);
      if (!entry) { entry = { english: "", chinese: null }; map.set(ln, entry); }
      if (lang === "EN") entry.english = text;
      else entry.chinese = text;
    }

    for (const [ln, entry] of [...map.entries()].sort(([a], [b]) => a - b)) {
      doc.appendFinalEnglish(entry.english);
      if (entry.chinese && entry.chinese !== "(翻译中...)") {
        doc.setChinese(ln, entry.chinese);
      }
    }
    return doc;
  }

  getFilePath(sessionId: string): string {
    return path.join(SESSIONS_DIR, `${sessionId}.md`);
  }
}
