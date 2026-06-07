// LLMCorrectionService.ts — LLM 上下文修正服务
// 实现 ICorrectionService，使用 ContextCorrectionEngine 构建 prompt，
// 调用 OpenAI 兼容 API 获取修正建议
// 职责：异步回顾历史译文，基于后续语义修正误译（fire-and-forget，延迟 < 3s）

import type { ICorrectionService } from "../domain/ICorrectionService.port";
import type { CorrectionRequest } from "../domain/CorrectionRequest.value-object";
import type { CorrectionSuggestion } from "../domain/CorrectionSuggestion.value-object";
import type { CorrectionPrompt } from "../domain/ContextCorrectionEngine.service";
import type { TranslationProviderConfig } from "../domain/TranslationProviderConfig.value-object";
import type { ContextEntry } from "../domain/ContextEntry.value-object";
import { TranslationError } from "../../../../../shared/errors/AppError";

interface CorrectionResponse {
  corrections: Array<{
    targetIndex: number;
    oldEnglish: string;
    newEnglish: string;
    oldChinese: string;
    newChinese: string;
    reason: string;
  }>;
}

function isCorrectionResponse(obj: unknown): obj is CorrectionResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "corrections" in obj &&
    Array.isArray((obj as Record<string, unknown>).corrections)
  );
}

export class LLMCorrectionService implements ICorrectionService {
  constructor(
    private readonly provider: TranslationProviderConfig,
    private readonly buildCorrectionPrompt: (
      currentText: string,
      currentTranslation: string,
      currentSegmentId: string,
      history: readonly ContextEntry[],
    ) => CorrectionPrompt,
  ) {}

  async review(req: CorrectionRequest): Promise<readonly CorrectionSuggestion[]> {
    const prompt = this.buildCorrectionPrompt(
      req.currentText,
      req.currentTranslation,
      req.currentSegmentId,
      req.history,
    );

    const response = await fetch(this.provider.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.provider.apiKey}`,
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
        `Correction API error: ${response.status} — ${body.slice(0, 200)}`,
      );
    }

    const data: unknown = await response.json();
    const content =
      typeof data === "object" && data !== null &&
      "choices" in data &&
      Array.isArray((data as Record<string, unknown>).choices)
        ? ((data as Record<string, unknown>).choices as Array<{ message?: { content?: string } }>)[0]?.message?.content ?? "{}"
        : "{}";

    return this.#parseCorrections(content, req.currentSegmentId);
  }

  #parseCorrections(content: string, currentSegmentId?: string): readonly CorrectionSuggestion[] {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!isCorrectionResponse(parsed)) return [];

      return parsed.corrections.map((c) => {
        // targetIndex === -1 表示修正当前句，使用 currentSegmentId
        const targetSegmentId =
          c.targetIndex === -1 && currentSegmentId
            ? currentSegmentId
            : `seg_${String(c.targetIndex).padStart(3, "0")}`;
        return {
          targetSegmentId,
          oldEnglish: c.oldEnglish,
          newEnglish: c.newEnglish,
          oldChinese: c.oldChinese,
          newChinese: c.newChinese,
          reason: c.reason,
        };
      });
    } catch {
      return [];
    }
  }
}
