// StablePauseTranslationGate.ts — 文本稳定后触发 NMT 翻译的门控策略
// 实现 ITranslationGate，基于文本稳定性而非 ASR final 决定翻译时机
//
// 决策规则：
//   1. ASR final          → 立即翻译（明确结束信号）
//   2. 标点结尾           → 立即翻译（可靠句子边界）
//   3. 停顿 > 800ms       → 立即翻译（说话者换气/思考）
//   4. 弹幕池满 (≥10)     → 立即翻译（防止溢出）
//   5. 其他               → 等待（文本仍在快速变化）

import {
  type ITranslationGate,
  GATE_RETRY_DELAY_MS,
  GATE_MAX_POOL_SIZE,
} from "../domain/ITranslationGate.port";
import type { SegmentState } from "../domain/SegmentState.value-object";
import type { SpeechMetrics } from "../domain/SpeechMetrics.value-object";

export class StablePauseTranslationGate implements ITranslationGate {
  shouldTranslate(state: SegmentState, metrics: SpeechMetrics): boolean {
    // 1. ASR 明确结束
    if (state.isFinal) return true;

    // 2. 句号/问号/感叹号结尾 → 句子边界信号
    if (metrics.punctuationEnds) return true;

    // 3. 文本稳定：无新 partial 超过阈值
    if (metrics.msSinceLastPartial >= GATE_RETRY_DELAY_MS) return true;

    // 4. 弹幕池满：必须翻译以腾出空间
    if (metrics.segmentCount >= GATE_MAX_POOL_SIZE) return true;

    // 5. 文本仍在快速变化 → 等待稳定
    return false;
  }
}
