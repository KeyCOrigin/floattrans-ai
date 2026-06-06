// SpeechTextNormalizer.service.ts — 语音转写文本归一化器

import type { ISpeechTextNormalizer } from "./ISpeechTextNormalizer.port";
import type { NormalizedText } from "./NormalizedText.value-object";

/** 英语常见填充词（口语停顿） */
const FILLER_WORDS = /\b(um|uh|er|ah|hmm|like, you know|I mean)\b/gi;
/** 多空格 → 单空格 */
const MULTI_SPACE = /\s{2,}/g;
/** 句首标点：逗号、句号、分号出现在文本首位 */
const LEADING_PUNCTUATION = /^[,.，。、；;:：!！?？]+/;
/** 中文句首标点 */
const CN_LEADING_PUNCTUATION = /^[，。、；：！？]+/;

export class SpeechTextNormalizer implements ISpeechTextNormalizer {
  normalizeForTranslation(raw: string): NormalizedText {
    let cleaned = raw.trim();
    if (!cleaned) {
      return { original: raw, normalized: "", isMidSentence: false };
    }

    // 去除填充词
    cleaned = cleaned.replace(FILLER_WORDS, "").replace(MULTI_SPACE, " ").trim();

    // 检测是否句中断片：首字符非大写字母且非数字
    const firstChar = cleaned.charAt(0);
    const isMidSentence = /[a-z]/.test(firstChar) && !/[A-Z0-9]/.test(firstChar);

    // 去除句首标点
    const normalized = cleaned.replace(LEADING_PUNCTUATION, "").trim();

    // 首字母大写（若非句中断片）
    const final = isMidSentence
      ? normalized
      : normalized.charAt(0).toUpperCase() + normalized.slice(1);

    return { original: raw, normalized: final, isMidSentence };
  }

  normalizeTranslationOutput(raw: string): string {
    if (!raw) return raw;
    return raw.trim().replace(CN_LEADING_PUNCTUATION, "").trim();
  }
}
