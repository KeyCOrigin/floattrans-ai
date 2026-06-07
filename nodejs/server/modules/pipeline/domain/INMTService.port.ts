// INMTService.port.ts — NMT 快速翻译接口（Phase 1）
// 定义在领域层，由基础设施层实现（百度翻译 / 火山引擎 / DeepL 等）
// 职责：纯文本映射，无上下文，无修正逻辑，低延迟（目标 < 400ms）
//
// Phase 1 变化：
//   - NmtTranslateContext.lineNumber → lineId（稳定身份，替代可变行号）
//   - 调度器通过 lineId 做 per-line 队列合并，通过 priority 做优先调度

/**
 * NMT 翻译调度上下文（值对象）。
 * 所有字段 readonly + optional——纯文本映射实现（如 BaiduNMTService）可完全忽略。
 * 调度器（如 NmtSchedulerService）通过 lineId 做 per-line 队列合并，
 * 通过 priority 做优先调度。
 */
export interface NmtTranslateContext {
  /** 稳定行 ID（调度器用于 per-line 任务合并，非必填） */
  readonly lineId?: string;
  /** 版本号（sourceVersion，用于陈旧结果丢弃，非必填） */
  readonly version?: number;
  /** 优先级（punct/segment 触发的设为 "high"） */
  readonly priority?: "normal" | "high";
}

export interface INMTService {
  /**
   * 低延迟英文→中文翻译。
   * @param text  待翻译文本
   * @param ctx   调度上下文（可选；纯文本映射实现可忽略，调度器用于队列优化）
   */
  translate(text: string, ctx?: NmtTranslateContext): Promise<string>;
}
