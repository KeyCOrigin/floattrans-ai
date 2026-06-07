// ISpeechTextNormalizer.port.ts — 语音转写文本归一化器接口

import type { NormalizedText } from "./NormalizedText.value-object";

export interface ISpeechTextNormalizer {
  /** 翻译前：清理ASR原始词流，去除句首标点、重复词、填充词 */
  normalizeForTranslation(raw: string): NormalizedText;
  /** 翻译后：清理LLM输出，去除句首标点，规范化空格与断句 */
  normalizeTranslationOutput(raw: string): string;
}
