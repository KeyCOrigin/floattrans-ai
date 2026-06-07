// ITranslationGate.port.ts — 翻译门控接口 + 共享常量
// 职责：决定在什么条件下允许执行 NMT 翻译
// 定义在领域层，由基础设施层实现具体策略
//
// 共享常量：AudioPipeline、StablePauseTranslationGate 均引用此处，避免 DRY 违反

import type { SegmentState } from "./SegmentState.value-object";
import type { SpeechMetrics } from "./SpeechMetrics.value-object";

/** 门控拒绝后的重试延迟（ms）：文本稳定停顿时长阈值 */
export const GATE_RETRY_DELAY_MS = 800;
/** 弹幕池容量上限 */
export const GATE_MAX_POOL_SIZE = 10;

export interface ITranslationGate {
  /** 判断当前 segment 是否应该触发 NMT 翻译 */
  shouldTranslate(state: SegmentState, metrics: SpeechMetrics): boolean;
}
