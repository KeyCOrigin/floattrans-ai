// LLMCorrectionService.ts — LLM 全文修正服务（v5）
// 实现 ICorrectionService，通读完整对话文档后做全量修正
//
// v5 修复：
//   - SYSTEM_PROMPT 格式说明与实际 markdown 一致（**[N] EN:**）
//   - 设置 max_tokens=8192，防止长文档输出被截断
//   - 检测 finish_reason，截断时记录警告

import type { ICorrectionService } from "../domain/ICorrectionService.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

const SYSTEM_PROMPT = `你是一个专业同声传译校对员。以下是实时转写和翻译的对话记录。

文档格式说明：
- 每一行以 **[行号] EN:** 开头的是英文原文（行尾有两个空格表示硬换行）
- 每一行以 **[行号] ZH:** 开头的是中文译文（[已修复] 标记表示之前已被修正过）
- EN 和 ZH 成对出现，中间有空行分隔

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

返回要求：
- 必须返回修正后的**完整文档**（不要只返回有修改的部分）
- 保持 **[N] EN:** / **[N] ZH:** 格式
- 不要添加任何解释性文字、不要添加 markdown 代码块包裹
- 如果所有翻译都正确且无需合并，直接返回原文。`;

interface CorrectionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class LLMCorrectionService implements ICorrectionService {
  constructor(private readonly config: CorrectionConfig) {}

  async reviewFullDocument(markdown: string): Promise<string> {
    process.stderr.write(
      `[LLMCorrection] sending ${markdown.length} chars (≈${Math.round(markdown.length / 4)} tokens)\n`,
    );

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
        max_tokens: 4096000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TranslationError(
        `LLM Correction API error: ${response.status} — ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices =
      data?.choices != null && Array.isArray(data.choices) && data.choices.length > 0
        ? (data.choices as Array<{ message?: { content?: string }; finish_reason?: string }>)
        : null;

    if (!choices) {
      process.stderr.write("[LLMCorrection] no choices in response, returning original\n");
      return markdown;
    }

    const content = choices[0]?.message?.content ?? markdown;
    const finishReason = choices[0]?.finish_reason ?? "unknown";

    process.stderr.write(
      `[LLMCorrection] response ${String(content).length} chars, ` +
      `finish_reason=${finishReason}, ` +
      `usage=${JSON.stringify(data?.usage)}\n`,
    );

    // 截断警告：输出可能不完整，diff 只能比对已有部分
    if (finishReason === "length") {
      process.stderr.write(
        `[LLMCorrection] ⚠️  output truncated! ` +
        `Consider increasing max_tokens or reducing document size.\n`,
      );
    }

    return String(content).trim();
  }
}
