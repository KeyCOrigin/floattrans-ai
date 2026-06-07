// FinalOnlyTranslationGate.ts — 仅在 ASR final 时允许 NMT 翻译的门控策略
// 实现 ITranslationGate，确保 partial 阶段不触发 NMT，避免逐词翻译闪烁

import type { ITranslationGate } from "../domain/ITranslationGate.port";
import type { SegmentState } from "../domain/SegmentState.value-object";
import type { SpeechMetrics } from "../domain/SpeechMetrics.value-object";

export class FinalOnlyTranslationGate implements ITranslationGate {
  shouldTranslate(state: SegmentState, _metrics: SpeechMetrics): boolean {
    return state.isFinal;
  }
}
