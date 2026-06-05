// GPT4MiniTranslationService.ts — GPT-4o-mini 实现 ITranslationService
// 封装 OpenAI API 调用，仅负责网络请求与响应解析，不包含业务规则

import type { ITranslationService, TranslationRequest } from "../domain/ITranslationService.port";
import type { TranslationResult } from "../domain/TranslationResult.value-object";
import type { CorrectionSuggestion } from "../domain/CorrectionSuggestion.value-object";
import type { CorrectionPrompt } from "../domain/ContextCorrectionEngine.service";
import type { ContextEntry } from "../domain/ContextEntry.value-object";

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class GPT4MiniTranslationService implements ITranslationService {
  constructor(
    private readonly apiKey: string,
    private readonly buildPrompt: (text: string, context: readonly ContextEntry[]) => CorrectionPrompt,
  ) {}

  async translateWithContext(req: TranslationRequest): Promise<TranslationResult> {
    const prompt = this.buildPrompt(req.text, req.context);

    // 实际部署时取消注释：
    //
    // const response = await fetch("https://api.openai.com/v1/chat/completions", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Authorization": `Bearer ${this.apiKey}`,
    //   },
    //   body: JSON.stringify({
    //     model: "gpt-4o-mini",
    //     messages: [
    //       { role: "system", content: prompt.systemPrompt },
    //       { role: "user", content: prompt.userPrompt },
    //     ],
    //     temperature: 0.3,
    //     response_format: { type: "json_object" },
    //   }),
    // });
    //
    // if (!response.ok) {
    //   const body = await response.text().catch(() => "");
    //   throw new TranslationError(`OpenAI API error: ${response.status} — ${body.slice(0, 200)}`);
    // }
    //
    // const data: OpenAIResponse = await response.json();
    // const content = data.choices[0]?.message?.content ?? "{}";
    // return this.#parseResponse(content, req.text);

    // 当前返回占位结果（编译通过）
    return {
      translation: `${req.text} (翻译占位)`,
      corrections: [],
      originalText: req.text,
    };
  }

  #parseResponse(content: string, originalText: string): TranslationResult {
    try {
      const parsed = JSON.parse(content) as {
        translation: string;
        corrections?: Array<{
          targetIndex: number;
          oldEnglish: string;
          newEnglish: string;
          oldChinese: string;
          newChinese: string;
          reason: string;
        }>;
      };

      const corrections: CorrectionSuggestion[] = (parsed.corrections ?? []).map((c) => ({
        targetSegmentId: `seg_${String(c.targetIndex).padStart(3, "0")}`,
        oldEnglish: c.oldEnglish,
        newEnglish: c.newEnglish,
        oldChinese: c.oldChinese,
        newChinese: c.newChinese,
        reason: c.reason,
      }));

      return {
        translation: parsed.translation,
        corrections,
        originalText,
      };
    } catch {
      return {
        translation: originalText,
        corrections: [],
        originalText,
      };
    }
  }
}
