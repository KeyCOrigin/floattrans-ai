// ITranscriptRepository.port.ts — 转录文档仓储接口（Phase 1）
//
// Phase 1 变化：TranscriptDocument → LiveDocument

import type { LiveDocument } from "./LiveDocument.entity";

export interface ITranscriptRepository {
  /** 持久化文档到 .md 文件 */
  save(doc: LiveDocument): void;
  /** 从 .md 文件加载文档 */
  load(sessionId: string): LiveDocument | null;
  /** 返回 .md 文件路径 */
  getFilePath(sessionId: string): string;
}
