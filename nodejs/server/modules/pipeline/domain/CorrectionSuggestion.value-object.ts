// CorrectionSuggestion.value-object.ts — 修正建议值对象

export interface CorrectionSuggestion {
  readonly targetSegmentId: string;
  readonly oldEnglish: string;
  readonly newEnglish: string;
  readonly oldChinese: string;
  readonly newChinese: string;
  readonly reason: string;
}
