// AdaptiveDebounceEngine.service.ts — 语速自适应防抖引擎

import type { IAdaptiveDebounceStrategy } from "./IAdaptiveDebounceStrategy.port";
import type { DebounceDecision } from "./DebounceDecision.value-object";
import type { SpeechMetrics } from "./SpeechMetrics.value-object";

/** 快速语速阈值（字符/秒） */
const FAST_PACE_THRESHOLD = 15;
/** 慢速语速阈值（字符/秒） */
const SLOW_PACE_THRESHOLD = 8;
/** 快速：防抖 250ms，增量阈值 20 字符 */
const FAST_DEBOUNCE = 250;
const FAST_THRESHOLD = 20;
/** 正常：防抖 450ms，增量阈值 25 字符 */
const NORMAL_DEBOUNCE = 450;
const NORMAL_THRESHOLD = 25;
/** 慢速：防抖 700ms，增量阈值 30 字符 */
const SLOW_DEBOUNCE = 700;
const SLOW_THRESHOLD = 30;
/** 弹幕池最大条目数 */
const MAX_DANMAKU_ENTRIES = 10;

export class AdaptiveDebounceEngine implements IAdaptiveDebounceStrategy {
  decide(
    currentText: string,
    lastTranslatedText: string,
    metrics: SpeechMetrics,
  ): DebounceDecision {
    // 池满 → 立即翻译（需要尽快推出旧条目）
    if (metrics.segmentCount >= MAX_DANMAKU_ENTRIES) {
      return { debounceMs: 0, shouldTranslate: true };
    }

    const newChars = currentText.length - lastTranslatedText.length;

    // 根据语速区间选参数
    let debounceMs: number;
    let threshold: number;

    if (metrics.charsPerSecond > FAST_PACE_THRESHOLD) {
      debounceMs = FAST_DEBOUNCE;
      threshold = FAST_THRESHOLD;
    } else if (metrics.charsPerSecond >= SLOW_PACE_THRESHOLD) {
      debounceMs = NORMAL_DEBOUNCE;
      threshold = NORMAL_THRESHOLD;
    } else {
      debounceMs = SLOW_DEBOUNCE;
      threshold = SLOW_THRESHOLD;
    }

    // 句边界 → 防抖减半
    if (metrics.punctuationEnds) {
      debounceMs = Math.floor(debounceMs / 2);
    }

    const shouldTranslate = newChars >= threshold;

    return { debounceMs, shouldTranslate };
  }
}
