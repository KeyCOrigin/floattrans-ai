// IAdaptiveDebounceStrategy.port.ts — 自适应防抖策略接口

import type { DebounceDecision } from "./DebounceDecision.value-object";
import type { SpeechMetrics } from "./SpeechMetrics.value-object";

export interface IAdaptiveDebounceStrategy {
  /** 决定本次 partial 到达后是否翻译、等多久 */
  decide(
    currentText: string,
    lastTranslatedText: string,
    metrics: SpeechMetrics,
  ): DebounceDecision;
}
