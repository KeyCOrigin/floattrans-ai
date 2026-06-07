// TranslationResult.value-object.ts — 翻译结果值对象
// 注意：修正（corrections）已移至独立的 ICorrectionService 路径，
// TranslationResult 仅包含纯翻译结果

export interface TranslationResult {
  readonly translation: string;
  readonly originalText: string;
}
