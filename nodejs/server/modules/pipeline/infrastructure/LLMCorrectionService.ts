// LLMCorrectionService.ts — LLM 全文修正服务（v6）
// 实现 ICorrectionService，通读完整对话文档后做全量修正
//
// v6 修复：
//   - LLM 直接输出隐藏标记（HTML 注释），前端 react-markdown 天然不渲染
//   - 移除"重新编号"要求，LLM 保留原始行号
//   - 补充合并操作具体步骤 + 输入输出示例

import type { ICorrectionService } from "../domain/ICorrectionService.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

const SYSTEM_PROMPT = `你是一个专业同声传译校对员。以下是实时转写和翻译的对话记录。

文档格式说明：
- 每一行以 **[行号] EN:** 开头的是英文原文
- 每一行以 **[行号] ZH:** 开头的是中文译文（[已修复] 标记表示之前已被修正过）
- EN 和 ZH 成对出现，中间有空行分隔

请检查并修正中文翻译的：
1. 语义准确性（是否忠实原文）
2. 上下文连贯性（前后句是否逻辑一致）
3. 术语一致性（同一概念是否使用相同的译法）

## 合并重复句子的操作规则

实时转写会产生同一句话的多次增量修正——后面的行只是比前面的多了几个词，
开头完全相同，明显是同一句话在逐步完善，并非独立新句。

【识别标准】
连续多行英文的开头部分完全相同（如第 1 行 "I hear"、第 2 行 "I hear birds"、
第 3 行 "I hear birds chirping"），后面的行是前者的超集。

【合并步骤】
1. 保留最后一行（最完整版本）为可见行，不要修改其内容
2. 将被合并的旧版本用 HTML 注释包裹，行号不变，不要重新编号：
     <!-- **[N] EN:** 旧版英文 -->
     <!-- **[N] ZH:** 旧版中文 -->
3. 保留可见行的 ZH 翻译（若有），不要凭空创造新内容

【示例】
输入：
  **[1] EN:** I hear
  **[1] ZH:** 我听到

  **[2] EN:** I hear birds
  **[2] ZH:** 我听到鸟

  **[3] EN:** I hear birds chirping
  **[3] ZH:** 我听到鸟儿在叫

  **[4] EN:** Another sentence
  **[4] ZH:** 另一个句子

输出：
  <!-- **[1] EN:** I hear -->
  <!-- **[1] ZH:** 我听到 -->

  <!-- **[2] EN:** I hear birds -->
  <!-- **[2] ZH:** 我听到鸟 -->

  **[3] EN:** I hear birds chirping
  **[3] ZH:** 我听到鸟儿在叫

  **[4] EN:** Another sentence
  **[4] ZH:** 另一个句子

【重要约束】
- 只合并开头相同、语义完全一致的增量版本
- 绝不要合并内容不同的独立句子
- 如果无法确定是否为增量，宁可保留不合并

返回要求：
- 必须返回修正后的**完整文档**（不要只返回有修改的部分）
- 保持 **[N] EN:** / **[N] ZH:** 格式
- 不要添加任何解释性文字、不要添加 markdown 代码块包裹
- 如果所有翻译都正确且无需合并，直接返回原文。`;

interface CorrectionConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
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
      throw new TranslationError(
        "LLM Correction: API returned no choices",
      );
    }

    const choice = choices[0]!;
    const content = choice.message?.content ?? markdown;
    const finishReason = choice.finish_reason ?? "unknown";

    if (finishReason === "length") {
      process.stderr.write(
        `[LLMCorrection] ⚠️  output truncated! ` +
        `response ${String(content).length} chars. ` +
        `Consider increasing max_tokens or reducing document size.\n`,
      );
    }

    return String(content).trim();
  }
}
