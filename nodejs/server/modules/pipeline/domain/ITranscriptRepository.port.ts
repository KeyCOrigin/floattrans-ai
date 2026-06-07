// ITranscriptRepository.port.ts — 转录文档仓储接口

import type { TranscriptDocument } from "./TranscriptDocument.entity";

export interface ITranscriptRepository {
  /** 持久化文档到 .md 文件 */
  save(doc: TranscriptDocument): void;
  /** 从 .md 文件加载文档 */
  load(sessionId: string): TranscriptDocument | null;
  /** 返回 .md 文件路径 */
  getFilePath(sessionId: string): string;
}
