// LiveLine.entity.ts — 稳定身份行实体（Phase 1）
//
// 核心变化 vs TranscriptLine.value-object.ts：
//   - id: string (UUID) 替代 mutable lineNumber 作为稳定身份
//   - sourceVersion / nmtVersion / refinedVersion 三重版本追踪
//   - hidden / mergedInto 为 Phase 2 合并不删行做准备
//   - ASR 修正 → refineEnglish() 更新英文+递增 sourceVersion
//   - NMT 完成 → applyNmt() 陈旧守卫（sourceVersion 不匹配→丢弃）
//   - LLM 修正 → applyRefinement() 更新中文+递增 refinedVersion

export type LineStatus = "pending" | "translated" | "corrected";

/** 序列化快照，用于持久化和前端传输 */
export interface LiveLineSnapshot {
  readonly id: string;
  readonly english: string;
  readonly chinese: string | null;
  readonly status: LineStatus;
  readonly sourceVersion: number;
  readonly nmtVersion: number;
  readonly refinedVersion: number;
  readonly hidden: boolean;
  readonly mergedInto: string | null;
}

/** UUID v4 生成器（领域层不依赖 node:crypto 实现细节） */
let _uuidGenerator: (() => string) | null = null;

export function setUuidGenerator(fn: () => string): void {
  _uuidGenerator = fn;
}

function generateId(): string {
  if (_uuidGenerator) return _uuidGenerator();
  // Fallback: timestamp-based unique ID（仅用于测试环境无 crypto 时）
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class LiveLine {
  readonly id: string;
  #english: string;
  #chinese: string | null = null;
  #status: LineStatus = "pending";
  #sourceVersion = 1;
  #nmtVersion = 0;
  #refinedVersion = 0;
  #hidden = false;
  #mergedInto: string | null = null;

  private constructor(id: string, english: string) {
    this.id = id;
    this.#english = english;
  }

  /** 工厂方法：创建新行 */
  static create(english: string): LiveLine {
    return new LiveLine(generateId(), english);
  }

  /** 反序列化：从持久化快照重建 */
  static fromSnapshot(snap: LiveLineSnapshot): LiveLine {
    const line = new LiveLine(snap.id, snap.english);
    line.#chinese = snap.chinese;
    line.#status = snap.status;
    line.#sourceVersion = snap.sourceVersion;
    line.#nmtVersion = snap.nmtVersion;
    line.#refinedVersion = snap.refinedVersion;
    line.#hidden = snap.hidden;
    line.#mergedInto = snap.mergedInto;
    return line;
  }

  // ── 访问器 ──

  get english(): string { return this.#english; }
  get chinese(): string | null { return this.#chinese; }
  get status(): LineStatus { return this.#status; }
  get sourceVersion(): number { return this.#sourceVersion; }
  get nmtVersion(): number { return this.#nmtVersion; }
  get refinedVersion(): number { return this.#refinedVersion; }
  get hidden(): boolean { return this.#hidden; }
  get mergedInto(): string | null { return this.#mergedInto; }

  // ── 业务方法 ──

  /**
   * ASR 增量修正：更新英文文本，递增 sourceVersion。
   * 调用方（LiveDocument.appendOrRefine）保证仅在同一句修正时调用。
   */
  refineEnglish(text: string): void {
    this.#english = text;
    this.#sourceVersion++;
  }

  /**
   * NMT 翻译完成：填充中文译文。
   *
   * @param chinese                NMT 返回的译文
   * @param expectedSourceVersion  发起翻译时的 sourceVersion
   * @returns true=已应用，false=陈旧丢弃（sourceVersion 已变化）
   */
  applyNmt(chinese: string, expectedSourceVersion: number): boolean {
    if (expectedSourceVersion !== this.#sourceVersion) return false;
    this.#chinese = chinese;
    this.#nmtVersion = expectedSourceVersion;
    if (this.#status === "pending") {
      this.#status = "translated";
    }
    return true;
  }

  /**
   * LLM 全文修正：更新中文译文，递增 refinedVersion。
   */
  applyRefinement(chinese: string): void {
    this.#chinese = chinese;
    this.#refinedVersion++;
    this.#status = "corrected";
  }

  /** Phase 2：标记此行已被合并到另一行（软删除，不物理移除） */
  hide(mergedIntoLineId: string): void {
    this.#hidden = true;
    this.#mergedInto = mergedIntoLineId;
  }

  /** Phase 2：取消隐藏（MergeGroup 过期丢弃时恢复） */
  unhide(): void {
    this.#hidden = false;
    this.#mergedInto = null;
  }

  /** 导出快照 */
  toSnapshot(): LiveLineSnapshot {
    return {
      id: this.id,
      english: this.#english,
      chinese: this.#chinese,
      status: this.#status,
      sourceVersion: this.#sourceVersion,
      nmtVersion: this.#nmtVersion,
      refinedVersion: this.#refinedVersion,
      hidden: this.#hidden,
      mergedInto: this.#mergedInto,
    };
  }
}
