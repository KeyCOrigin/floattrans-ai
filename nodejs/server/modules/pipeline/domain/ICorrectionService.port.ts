// ICorrectionService.port.ts — LLM 上下文修正接口（v4）
// 不再使用逐句 CorrectionRequest，改为全文读取/修正模式

export interface ICorrectionService {
  /** 读取完整 markdown 文档，返回修正后的全文 */
  reviewFullDocument(markdown: string): Promise<string>;
}
