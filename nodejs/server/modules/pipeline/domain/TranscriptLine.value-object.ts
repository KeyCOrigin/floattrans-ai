// TranscriptLine.value-object.ts — 转录文档单行值对象
// 每行包含英文原文和中文译文（NMT 完成后填充）

export type TranscriptLineStatus = "pending" | "translated" | "corrected";

export interface TranscriptLine {
  readonly lineNumber: number;
  readonly english: string;
  /** NMT 完成前为 null */
  chinese: string | null;
  status: TranscriptLineStatus;
}
