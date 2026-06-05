// ContextCorrectionEngine.service.ts — 上下文纠错引擎
// 职责：根据后文语义构建 LLM 纠错 prompt
// 不直接调 LLM（那是 infrastructure 的职责）

import type { ContextEntry } from "./ContextEntry.value-object";

export interface CorrectionPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

const SYSTEM_PROMPT = `You are a professional simultaneous interpreter. Your tasks:
1. Translate the given English sentence into Chinese.
2. Review the context: if a previous sentence was mistranslated due to missing later context, provide a correction.

Output as JSON:
{
  "translation": "Chinese translation of current sentence",
  "corrections": [
    {
      "targetIndex": 0,
      "oldEnglish": "original wrong text",
      "newEnglish": "corrected english",
      "oldChinese": "original wrong translation",
      "newChinese": "corrected chinese translation",
      "reason": "why corrected"
    }
  ]
}

If no correction is needed, return an empty corrections array.`;

export class ContextCorrectionEngine {
  buildPrompt(text: string, context: readonly ContextEntry[]): CorrectionPrompt {
    const contextLines = context
      .map((entry, i) => `[${i}] EN: ${entry.en} | ZH: ${entry.zh}`)
      .join("\n");

    const userPrompt = context.length > 0
      ? `Context:\n${contextLines}\n\nCurrent sentence to translate:\n${text}`
      : `Current sentence to translate:\n${text}`;

    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    };
  }
}
