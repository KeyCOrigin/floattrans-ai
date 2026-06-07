// DebounceDecision.value-object.ts — 防抖决策结果值对象

export interface DebounceDecision {
  /** 应等待的时长（ms），0 = 立即翻译 */
  readonly debounceMs: number;
  /** 是否应触发翻译 */
  readonly shouldTranslate: boolean;
}
