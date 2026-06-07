// LLMCorrectionService.ts — LLM 全文修正服务（v4）
// 实现 ICorrectionService，通读完整对话文档后做全量修正
// 不再使用逐句 CorrectionRequest，改为 reviewFullDocument(markdown: string)

import type { ICorrectionService } from "../domain/ICorrectionService.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

const SYSTEM_PROMPT = `你是一个专业同声传译校对员。以下是实时转写和翻译的对话记录。
每段格式：
[行号] EN: 英文原文
[行号] ZH: 中文译文

请检查并修正中文翻译的：
1. 语义准确性（是否忠实原文）
2. 上下文连贯性（前后句是否逻辑一致）
3. 术语一致性（同一概念是否使用相同的译法）
4. 实时转写会产生同一句话的多次增量修正。如果连续多行的英文文本差异极小
   （仅末尾多了几个词，开头完全相同，明显是同一句话在逐步完善），
   将它们合并为一行，保留最完整版本。但——
   重要：绝不要合并内容不同的独立句子。只合并开头相同、语义完全一致的增量版本。
   合并时保留该行的 ZH（若原文有对应翻译），不要凭空创造新内容。
   如果合并后行数变化，对所余全部行按 1 开始重新顺序编号。

直接返回修正后的完整文档（保持相同格式）。
不要添加任何解释性文字。如果所有翻译都正确且无需合并，直接返回原文。`;

interface CorrectionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class LLMCorrectionService implements ICorrectionService {
  constructor(private readonly config: CorrectionConfig) {}

  async reviewFullDocument(markdown: string): Promise<string> {
    const response = await fetch(this.config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: markdown },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TranslationError(
        `LLM Correction API error: ${response.status} — ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const content =
      data?.choices != null && Array.isArray(data.choices) && data.choices.length > 0
        ? (data.choices as Array<{ message?: { content?: string } }>)[0]?.message?.content ?? markdown
        : markdown;

    return String(content).trim();
  }
}
