// MergeGroupManager.test.ts — 合并组管理器测试（Phase 2）

import { describe, it, expect, beforeEach } from "vitest";
import { MergeGroupManager } from "../MergeGroupManager.service";
import { LiveDocument } from "../LiveDocument.entity";

describe("MergeGroupManager", () => {
  let mgr: MergeGroupManager;
  let doc: LiveDocument;

  beforeEach(() => {
    mgr = new MergeGroupManager();
    doc = LiveDocument.create("test-session");
  });

  it("create 创建合并组并索引", () => {
    const r1 = doc.appendOrRefine("Partial version A");
    const r2 = doc.appendOrRefine("Complete version B");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    const lineIds = [r1!.lineId, r2!.lineId];
    const group = mgr.create(lineIds, r2!.lineId, "Complete version B");

    expect(group.id).toMatch(/^mg_/);
    expect(group.lineIds).toEqual(lineIds);
    expect(group.dirty).toBe(false);

    const groups1 = mgr.getGroupsForLine(r1!.lineId);
    expect(groups1).toHaveLength(1);
    expect(groups1[0]!.id).toBe(group.id);
  });

  it("markDirtyByLine 标记关联组为脏", () => {
    const r1 = doc.appendOrRefine("Alpha");
    const r2 = doc.appendOrRefine("Beta");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    const group = mgr.create([r1!.lineId, r2!.lineId], r2!.lineId, "Beta");

    mgr.markDirtyByLine(r1!.lineId);
    const stale = mgr.getStaleGroups();
    expect(stale).toHaveLength(1);
    expect(stale[0]!.id).toBe(group.id);
    expect(stale[0]!.dirty).toBe(true);
  });

  it("getActiveGroups 只返回非脏组", () => {
    const r1 = doc.appendOrRefine("Alpha");
    const r2 = doc.appendOrRefine("Beta");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    mgr.create([r1!.lineId], r1!.lineId, "Alpha");
    const group2 = mgr.create([r2!.lineId], r2!.lineId, "Beta");

    mgr.markDirtyByLine(r1!.lineId);

    const active = mgr.getActiveGroups();
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(group2.id);
  });

  it("discardGroup 恢复隐藏行并清理索引", () => {
    const r1 = doc.appendOrRefine("First sentence");
    const r2 = doc.appendOrRefine("Second sentence");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.lineId).not.toBe(r2!.lineId);

    const group = mgr.create(
      [r1!.lineId, r2!.lineId],
      r2!.lineId,
      "Second sentence",
    );

    doc.hideLine(r1!.lineId, group.id);
    expect(doc.lines).toHaveLength(1);

    mgr.markDirtyByLine(r1!.lineId);
    mgr.discardGroup(group.id, doc);

    expect(doc.lines).toHaveLength(2);

    const groups = mgr.getGroupsForLine(r1!.lineId);
    expect(groups).toHaveLength(0);
  });

  it("reset 清空所有状态", () => {
    const r1 = doc.appendOrRefine("Xray");
    expect(r1).not.toBeNull();
    mgr.create([r1!.lineId], r1!.lineId, "Xray");

    mgr.reset();

    expect(mgr.getActiveGroups()).toHaveLength(0);
    expect(mgr.getStaleGroups()).toHaveLength(0);
    expect(mgr.getGroupsForLine(r1!.lineId)).toHaveLength(0);
  });

  it("getGroupsForLine 返回该行所有关联组", () => {
    const r1 = doc.appendOrRefine("Shared sentence");
    const r2 = doc.appendOrRefine("Group Alpha end");
    const r3 = doc.appendOrRefine("Group Beta end");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();

    mgr.create([r1!.lineId, r2!.lineId], r2!.lineId, "Group Alpha end");
    mgr.create([r1!.lineId, r3!.lineId], r3!.lineId, "Group Beta end");

    const groups = mgr.getGroupsForLine(r1!.lineId);
    expect(groups).toHaveLength(2);
  });
});
