// OpenAICompatibleTranslationService.ts — 通用 OpenAI 兼容翻译服务
// 实现 ITranslationService，支持 OpenAI / DeepSeek / 硅基流动 / 阿里百炼 / 智谱 等
// 通过构造函数注入 TranslationProviderConfig 切换供应商

import type { ITranslationService, TranslationRequest } from "../domain/ITranslationService.port";
import type { TranslationResult } from "../domain/TranslationResult.value-object";
import type { CorrectionSuggestion } from "../domain/CorrectionSuggestion.value-object";
import type { CorrectionPrompt } from "../domain/ContextCorrectionEngine.service";
import type { TranslationProviderConfig } from "../domain/TranslationProviderConfig.value-object";
import type { ContextEntry } from "../domain/ContextEntry.value-object";
import { TranslationError } from "../../../../../shared/errors/AppError";

interface TranslationResponse {
  translation: string;
  corrections?: Array<{
    targetIndex: number;
    oldEnglish: string;
    newEnglish: string;
    oldChinese: string;
    newChinese: string;
    reason: string;
  }>;
}

function isTranslationResponse(obj: unknown): obj is TranslationResponse {
  return typeof obj === "object" && obj !== null && typeof (obj as Record<string, unknown>).translation === "string";
}

export class OpenAICompatibleTranslationService implements ITranslationService {
  constructor(
    private readonly provider: TranslationProviderConfig,
    private readonly buildPrompt: (text: string, context: readonly ContextEntry[]) => CorrectionPrompt,
  ) {}

  async translateWithContext(req: TranslationRequest): Promise<TranslationResult> {
    const prompt = this.buildPrompt(req.text, req.context);

    const response = await fetch(this.provider.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: this.provider.model,
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TranslationError(
        `${this.provider.model} API error: ${response.status} — ${body.slice(0, 200)}`
      );
    }

    const data: unknown = await response.json();
    const content = typeof data === "object" && data !== null &&
      "choices" in data &&
      Array.isArray((data as Record<string, unknown>).choices)
      ? ((data as Record<string, unknown>).choices as Array<{ message?: { content?: string } }>)[0]?.message?.content ?? "{}"
      : "{}";

    return this.#parseResponse(content, req.text);
  }

  #parseResponse(content: string, originalText: string): TranslationResult {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!isTranslationResponse(parsed)) {
        return { translation: originalText, corrections: [], originalText };
      }

      const corrections: CorrectionSuggestion[] = (parsed.corrections ?? []).map((c) => ({
        targetSegmentId: `seg_${String(c.targetIndex).padStart(3, "0")}`,
        oldEnglish: c.oldEnglish,
        newEnglish: c.newEnglish,
        oldChinese: c.oldChinese,
        newChinese: c.newChinese,
        reason: c.reason,
      }));

      return { translation: parsed.translation, corrections, originalText };
    } catch {
      return { translation: originalText, corrections: [], originalText };
    }
  }
}
