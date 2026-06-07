// MergeGroup.value-object.ts — LLM 合并组值对象（Phase 2 前置）
//
// 不可变值对象：记录 LLM 将多个 LiveLine 合并为一组的事实。
// 当组内任何一行的英文被 ASR 修正后，dirty 标记为 true，
// MergeGroupManager 检测到 dirty → 丢弃该组，恢复隐藏行。
//
// Phase 1: 定义结构，暂不使用。Phase 2 通过 MergeGroupManager 激活。

export interface MergeGroup {
  /** 合并组唯一 ID */
  readonly id: string;
  /** 组内全部行 ID（含代表行），按顺序 */
  readonly lineIds: readonly string[];
  /** 代表行 ID（保持可见的那一行，通常是最完整版本） */
  readonly representativeLineId: string;
  /** 合并后的代表文本（LLM 输出） */
  readonly representativeText: string;
  /** 脏标记：组内任一行被 ASR 修正后 → true */
  readonly dirty: boolean;
  /** 创建时间戳 */
  readonly createdAt: number;
}

/** 创建合并组 */
export function createMergeGroup(
  id: string,
  lineIds: readonly string[],
  representativeLineId: string,
  representativeText: string,
): MergeGroup {
  return {
    id,
    lineIds: [...lineIds],
    representativeLineId,
    representativeText,
    dirty: false,
    createdAt: Date.now(),
  };
}

/** 标记合并组为脏 */
export function markMergeGroupDirty(group: MergeGroup): MergeGroup {
  if (group.dirty) return group;
  return { ...group, dirty: true };
}
