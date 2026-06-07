// ITranscriptRepository.port.ts — 转录文档仓储接口（Phase 2）
//
// Phase 2 变化：新增 saveContent() 保存 LLM 原始输出

import type { LiveDocument } from "./LiveDocument.entity";

export interface ITranscriptRepository {
  /** 持久化文档到 .md 文件 */
  save(doc: LiveDocument): void;
  /** 直接写入 markdown 内容到 session 文件（LLM 原始输出） */
  saveContent(sessionId: string, markdown: string): void;
  /** 从 .md 文件加载文档 */
  load(sessionId: string): LiveDocument | null;
  /** 返回 .md 文件路径 */
  getFilePath(sessionId: string): string;
}
