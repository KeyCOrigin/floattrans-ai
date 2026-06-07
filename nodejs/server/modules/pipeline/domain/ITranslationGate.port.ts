// ITranslationGate.port.ts — 翻译门控接口
// 职责：决定在什么条件下允许执行 NMT 翻译
// 定义在领域层，由基础设施层实现具体策略

import type { SegmentState } from "./SegmentState.value-object";
import type { SpeechMetrics } from "./SpeechMetrics.value-object";

export interface ITranslationGate {
  /** 判断当前 segment 是否应该触发 NMT 翻译 */
  shouldTranslate(state: SegmentState, metrics: SpeechMetrics): boolean;
}
