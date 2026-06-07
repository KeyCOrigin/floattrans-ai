// ContextCorrectionEngine.service.ts — 上下文纠错引擎
// 职责：根据后文语义构建 LLM 纠错 prompt
// 不直接调 LLM（那是 infrastructure 的职责）
// 注意：首发翻译由 INMTService 完成，此处只做异步修正

import type { ContextEntry } from "./ContextEntry.value-object";

export interface CorrectionPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

const SYSTEM_PROMPT = `You are a professional simultaneous interpreter reviewing translations.

Given:
- The CURRENT sentence (just translated by a fast NMT engine)
- The history of PREVIOUS sentences with their existing translations

Your task: use context to correct mistranslations. You may correct BOTH previous sentences and the current sentence.

Return a JSON object with a "corrections" array. Each correction has:
{
  "corrections": [
    {
      "targetIndex": -1,
      "oldEnglish": "the original English text",
      "newEnglish": "the corrected English (usually same as oldEnglish)",
      "oldChinese": "the incorrect Chinese translation",
      "newChinese": "the corrected Chinese translation",
      "reason": "brief explanation"
    }
  ]
}

targetIndex rules:
- Use -1 to target the CURRENT sentence (the one just translated by NMT)
- Use 0, 1, 2... to target history sentences (0 = oldest in provided history)

RULES:
- Correct translations that are wrong given the full context.
- Focus on: disambiguating ambiguous words (e.g., "bank" as "银行" vs "河岸"), terminology consistency across sentences, homophones revealed by context.
- If the NMT translation is already correct, do NOT include it in corrections.
- If no correction is needed at all, return {"corrections": []}.`;

const TRANSLATION_SYSTEM_PROMPT = `You are a professional English-to-Chinese simultaneous interpreter.

Translate the following English speech transcription into natural, fluent Chinese.

Return a JSON object with:
{
  "translation": "the Chinese translation"
}

RULES:
- Use concise, natural Chinese suitable for spoken delivery.
- Preserve the original meaning accurately.
- If there is context provided, use it to disambiguate ambiguous terms.
- Do NOT add or omit information.`;

export class ContextCorrectionEngine {
  /** 构建 LLM 上下文修正 prompt（异步修正路径） */
  buildCorrectionPrompt(
    currentText: string,
    currentTranslation: string,
    currentSegmentId: string,
    history: readonly ContextEntry[],
  ): CorrectionPrompt {
    const contextLines = history
      .map((entry, i) => `[${i}] EN: ${entry.en} | ZH: ${entry.zh}`)
      .join("\n");

    const userPrompt = history.length > 0
      ? `History of previous sentences and their translations:\n${contextLines}\n\nCurrent sentence (segmentId: ${currentSegmentId}, NMT translated as: "${currentTranslation}"):\n${currentText}\n\nCheck if ANY translations (including the current one) need correction based on context. Use targetIndex=-1 for current, or 0..${history.length - 1} for history.`
      : `Current sentence (segmentId: ${currentSegmentId}, NMT translated as: "${currentTranslation}"):\n${currentText}\n\nNo history available. Check if the current NMT translation needs correction. Use targetIndex=-1.`;

    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    };
  }

  /** 构建纯翻译 prompt（向后兼容路径，用于 ITranslationService） */
  buildPrompt(
    text: string,
    context: readonly ContextEntry[],
  ): CorrectionPrompt {
    const contextLines = context
      .map((entry, i) => `[${i}] EN: ${entry.en} | ZH: ${entry.zh}`)
      .join("\n");

    const userPrompt = context.length > 0
      ? `Context:\n${contextLines}\n\nTranslate:\n${text}`
      : `Translate:\n${text}`;

    return {
      systemPrompt: TRANSLATION_SYSTEM_PROMPT,
      userPrompt,
    };
  }
}
