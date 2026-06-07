// NmtSchedulerService.ts — 有状态 NMT 调度器（INMTService Decorator）（Phase 1）
//
// 职责（全部在基础设施层，不违反 DIP）：
//   1. 请求去重：相同文本（归一化后）在 60s 内复用缓存，in-flight 请求合并
//   2. 并发控制：最多 N 个请求同时运行（默认 3），避免打爆百度 API
//   3. Per-line 队列合并：同一 lineId 只保留最新任务（替换旧 pending 任务）
//   4. 优先级调度：punct/segment 触发的高优先任务跳过队首
//   5. 耗时日志：wait / baidu 拆分，定位瓶颈
//
// Phase 1 变化：
//   - lineNumber → lineId（稳定身份，string 类型）
//   - #pendingByLine: Map<string, NmtTask>（key 为 lineId）

import type { INMTService, NmtTranslateContext } from "../domain/INMTService.port";

interface NmtTask {
  readonly seq: number;
  readonly text: string;
  readonly key: string;
  readonly resolve: (value: string) => void;
  readonly createdAt: number;
  readonly lineId?: string;
  readonly priority: "normal" | "high";
  isRunning: boolean;
}

interface CacheEntry {
  readonly value: string;
  readonly expireAt: number;
}

/** 归一化文本用于去重 key：小写 + 去标点 + 合并空格 */
function normalizeNmtKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:，。！？；：]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 为无 lineId 任务生成唯一 map key */
let _fallbackSeq = 0;
function fallbackKey(): string {
  return `__noline_${++_fallbackSeq}`;
}

export class NmtSchedulerService implements INMTService {
  readonly #delegate: INMTService;
  readonly #concurrency: number;

  #running = 0;
  #nextSeq = 1;
  /** 按 lineId（或 fallbackKey）索引的 pending 任务 Map */
  #pendingByLine = new Map<string, NmtTask>();
  /** 正在翻译中的请求（去重合并，按归一化 key） */
  #inFlight = new Map<string, Promise<string>>();
  /** 短 TTL 缓存，避免跨句重复翻译 */
  #cache = new Map<string, CacheEntry>();

  constructor(delegate: INMTService, concurrency = 3) {
    this.#delegate = delegate;
    this.#concurrency = concurrency;
  }

  translate(text: string, ctx?: NmtTranslateContext): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve(trimmed);

    const key = normalizeNmtKey(trimmed);

    // 1. 缓存命中（60s TTL）
    const cached = this.#cache.get(key);
    if (cached && cached.expireAt > Date.now()) {
      return Promise.resolve(cached.value);
    }

    // 2. 正在翻译去重（跨行，按归一化文本 key）
    const inFlight = this.#inFlight.get(key);
    if (inFlight) return inFlight;

    // 3. Per-line 队列合并：同 line 有 pending 任务 → 替换旧任务
    const lineId = ctx?.lineId;
    const mapKey = lineId ?? fallbackKey();
    if (lineId !== undefined) {
      const existing = this.#pendingByLine.get(mapKey);
      if (existing && !existing.isRunning) {
        // 旧任务尚未开始执行 → 从 inFlight 移除旧 key，替换为最新版
        this.#inFlight.delete(existing.key);
      }
    }

    // 4. 入队
    const seq = this.#nextSeq++;
    const createdAt = Date.now();

    let taskResolve: ((v: string) => void) | null = null;
    const promise = new Promise<string>((resolve) => { taskResolve = resolve; });
    const resolve = taskResolve!;

    this.#inFlight.set(key, promise);

    const task: NmtTask = {
      seq,
      text: trimmed,
      key,
      resolve,
      createdAt,
      lineId,
      priority: ctx?.priority ?? "normal",
      isRunning: false,
    };
    this.#pendingByLine.set(mapKey, task);
    this.#pump();

    return promise;
  }

  /**
   * 从 pending Map 中取优先级最高的任务。
   * 规则：high priority 优先，同优先级按 createdAt 升序（早入队优先）。
   */
  #takeNextTask(): NmtTask | undefined {
    if (this.#pendingByLine.size === 0) return undefined;

    const tasks = [...this.#pendingByLine.values()];
    tasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === "high" ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });

    const task = tasks[0]!;
    // 按 lineId 或 fallbackKey 删除
    const mapKey = task.lineId ?? fallbackKey();
    // 找到并删除对应的 entry
    for (const [k, v] of this.#pendingByLine) {
      if (v === task) {
        this.#pendingByLine.delete(k);
        break;
      }
    }
    return task;
  }

  #pump(): void {
    while (this.#running < this.#concurrency) {
      const task = this.#takeNextTask();
      if (!task) break;
      this.#running++;
      this.#executeTask(task);
    }
  }

  async #executeTask(task: NmtTask): Promise<void> {
    task.isRunning = true;
    const start = Date.now();
    try {
      const zh = await this.#delegate.translate(task.text);
      const elapsed = Date.now() - start;
      const waitMs = start - task.createdAt;
      process.stderr.write(
        `[NmtScheduler] seq=${task.seq} wait=${waitMs}ms baidu=${elapsed}ms ` +
        `pri=${task.priority} text="${task.text.slice(0, 50)}"\n`,
      );

      this.#cache.set(task.key, { value: zh, expireAt: Date.now() + 60_000 });
      if (this.#cache.size > 200) {
        const now = Date.now();
        for (const [k, v] of this.#cache) {
          if (v.expireAt <= now) this.#cache.delete(k);
        }
      }

      task.resolve(zh);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[NmtScheduler] seq=${task.seq} FAILED: ${message}\n`);
      task.resolve("");
    } finally {
      task.isRunning = false;
      this.#running--;
      this.#inFlight.delete(task.key);
      this.#pump();
    }
  }
}
