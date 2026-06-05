// DeepSeekTranslationService.ts — DeepSeek-V3 实现 ITranslationService
// 国内方案备用，API 兼容 OpenAI 格式

import type { ITranslationService, TranslationRequest } from "../domain/ITranslationService.port";
import type { TranslationResult } from "../domain/TranslationResult.value-object";

export class DeepSeekTranslationService implements ITranslationService {
  constructor(private readonly apiKey: string) {}

  async translateWithContext(req: TranslationRequest): Promise<TranslationResult> {
    // 实际部署时取消注释：
    //
    // const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Authorization": `Bearer ${this.apiKey}`,
    //   },
    //   body: JSON.stringify({
    //     model: "deepseek-chat",
    //     messages: [
    //       { role: "system", content: "You are a professional simultaneous interpreter..." },
    //       { role: "user", content: `Translate: "${req.text}"` },
    //     ],
    //     temperature: 0.3,
    //   }),
    // });

    return {
      translation: `${req.text} (翻译占位)`,
      corrections: [],
      originalText: req.text,
    };
  }
}
