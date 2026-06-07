// PipelineOutputPort.port.ts — 管道输出端口接口
// v5: Markdown 文档流架构

export type PipelineStatus =
  | "idle"
  | "asr_connecting"
  | "asr_connected"
  | "asr_error"
  | "translating"
  | "error";

export interface PipelineOutputPort {
  /** 全量 Markdown 文档（含 confirmed lines，供前端 react-markdown 渲染） */
  sendContent(markdown: string, version: number): void;
  /** ASR partial 实时英文（未 final，前端底部显示） */
  sendPartial(english: string): void;
  sendStatus(status: PipelineStatus, detail?: string): void;
  sendError(code: string, message: string): void;
  isAvailable(): boolean;
}
