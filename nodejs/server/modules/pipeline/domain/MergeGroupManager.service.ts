// MergeGroupManager.service.ts — 合并组管理器（Phase 2 前置）
//
// 领域服务：管理 LLM 行合并产生的 MergeGroup。
// 职责：
//   1. 创建合并组（LLM 返回合并结果时）
//   2. 标记脏组（ASR 修正组内任一行时）
//   3. 检测过期组（dirty → 需丢弃重建）
//
// Phase 1: 定义服务骨架，暂不接入管道。Phase 2 集成到 AudioPipeline。

import type { MergeGroup } from "./MergeGroup.value-object";
import { createMergeGroup, markMergeGroupDirty } from "./MergeGroup.value-object";
import type { LiveDocument } from "./LiveDocument.entity";

export class MergeGroupManager {
  /** lineId → 包含该行的所有合并组 ID */
  #indexByLine = new Map<string, Set<string>>();
  /** groupId → MergeGroup */
  #groups = new Map<string, MergeGroup>();

  /** 重置状态（新会话开始时调用） */
  reset(): void {
    this.#indexByLine.clear();
    this.#groups.clear();
  }

  /** 获取所有活跃（非脏）合并组 */
  getActiveGroups(): MergeGroup[] {
    return [...this.#groups.values()].filter((g) => !g.dirty);
  }

  /** 创建合并组：将多个行合并为一组 */
  create(
    lineIds: readonly string[],
    representativeLineId: string,
    representativeText: string,
  ): MergeGroup {
    const id = `mg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const group = createMergeGroup(id, lineIds, representativeLineId, representativeText);
    this.#groups.set(id, group);

    for (const lid of lineIds) {
      let set = this.#indexByLine.get(lid);
      if (!set) {
        set = new Set();
        this.#indexByLine.set(lid, set);
      }
      set.add(id);
    }

    return group;
  }

  /** 标记某行相关的所有合并组为脏（ASR 修正该行英文时调用） */
  markDirtyByLine(lineId: string): void {
    const groupIds = this.#indexByLine.get(lineId);
    if (!groupIds) return;
    for (const gid of groupIds) {
      const group = this.#groups.get(gid);
      if (group && !group.dirty) {
        this.#groups.set(gid, markMergeGroupDirty(group));
      }
    }
  }

  /** 获取某行关联的所有合并组 */
  getGroupsForLine(lineId: string): MergeGroup[] {
    const groupIds = this.#indexByLine.get(lineId);
    if (!groupIds) return [];
    return [...groupIds]
      .map((gid) => this.#groups.get(gid))
      .filter((g): g is MergeGroup => g != null);
  }

  /** 获取所有脏合并组（需要丢弃重建） */
  getStaleGroups(): MergeGroup[] {
    return [...this.#groups.values()].filter((g) => g.dirty);
  }

  /** 丢弃指定合并组，恢复被隐藏的行 */
  discardGroup(groupId: string, doc: LiveDocument): void {
    const group = this.#groups.get(groupId);
    if (!group) return;

    // 恢复 hidden 行（取消隐藏）
    for (const lid of group.lineIds) {
      if (lid !== group.representativeLineId) {
        doc.unhideLine(lid);
      }
    }

    // 清理索引
    this.#groups.delete(groupId);
    for (const lid of group.lineIds) {
      const set = this.#indexByLine.get(lid);
      if (set) {
        set.delete(groupId);
        if (set.size === 0) {
          this.#indexByLine.delete(lid);
        }
      }
    }
  }
}
