// NmtSchedulerService.ts — 有状态 NMT 调度器（INMTService Decorator）
//
// 职责（全部在基础设施层，不违反 DIP）：
//   1. 请求去重：相同文本（归一化后）在 60s 内复用缓存，in-flight 请求合并
//   2. 并发控制：最多 N 个请求同时运行（默认 3），避免打爆百度 API
//   3. 耗时日志：wait / baidu 拆分，定位瓶颈
//
// 领域层通过 INMTService 接口调用，完全不知道调度器存在。

import type { INMTService } from "../domain/INMTService.port";

interface NmtTask {
  readonly seq: number;
  readonly text: string;
  readonly key: string;
  readonly resolve: (value: string) => void;
  readonly createdAt: number;
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

export class NmtSchedulerService implements INMTService {
  readonly #delegate: INMTService;
  readonly #concurrency: number;

  #running = 0;
  #queue: NmtTask[] = [];
  #nextSeq = 1;
  /** 正在翻译中的请求（去重合并） */
  #inFlight = new Map<string, Promise<string>>();
  /** 短 TTL 缓存，避免跨句重复翻译 */
  #cache = new Map<string, CacheEntry>();

  constructor(delegate: INMTService, concurrency = 3) {
    this.#delegate = delegate;
    this.#concurrency = concurrency;
  }

  translate(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve(trimmed);

    const key = normalizeNmtKey(trimmed);

    // 1. 缓存命中（60s TTL）
    const cached = this.#cache.get(key);
    if (cached && cached.expireAt > Date.now()) {
      return Promise.resolve(cached.value);
    }

    // 2. 正在翻译去重
    const inFlight = this.#inFlight.get(key);
    if (inFlight) return inFlight;

    // 3. 入队
    const seq = this.#nextSeq++;
    const createdAt = Date.now();

    let taskResolve: ((v: string) => void) | null = null;
    const promise = new Promise<string>((resolve) => { taskResolve = resolve; });
    const resolve = taskResolve!;

    this.#inFlight.set(key, promise);
    this.#queue.push({ seq, text: trimmed, key, resolve, createdAt });
    this.#pump();

    return promise;
  }

  #pump(): void {
    while (this.#running < this.#concurrency && this.#queue.length > 0) {
      const task = this.#queue.shift();
      if (!task) break;
      this.#running++;
      this.#executeTask(task);
    }
  }

  async #executeTask(task: NmtTask): Promise<void> {
    const start = Date.now();
    try {
      const zh = await this.#delegate.translate(task.text);
      const elapsed = Date.now() - start;
      const waitMs = start - task.createdAt;
      process.stderr.write(
        `[NmtScheduler] seq=${task.seq} wait=${waitMs}ms baidu=${elapsed}ms ` +
        `text="${task.text.slice(0, 50)}"\n`,
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
      this.#running--;
      this.#inFlight.delete(task.key);
      this.#pump();
    }
  }
}
