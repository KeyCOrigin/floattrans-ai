// TranslationResult.value-object.ts — 翻译结果值对象

import type { CorrectionSuggestion } from "./CorrectionSuggestion.value-object";

export interface TranslationResult {
  readonly translation: string;
  readonly corrections: readonly CorrectionSuggestion[];
  readonly originalText: string;
}
