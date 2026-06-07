// PartialSegmentManager.service.ts — Partial 片段管理器
// 职责：将 ASR 不断修正的 partial 结果聚合为一个稳定的 utterance
//
// 算法：Longest Common Prefix（最长公共前缀）
//   - "I am" → "I am Chen" → 同一 utterance 的扩展 → update
//   - "I am Chen" → "Today is Monday" → 完全不同 → new utterance
//
// 效果：用户只看到一条字幕不断更新，而不是 N 条重复字幕

import type { IPartialSegmentManager } from "./IPartialSegmentManager.port";
import type { SegmentState } from "./SegmentState.value-object";

/** 编辑距离超过此比例视为新 utterance */
const REPLACE_THRESHOLD = 0.5;

export class PartialSegmentManager implements IPartialSegmentManager {
  #segmentId: string | null = null;
  #currentText = "";
  #counter = 0;

  acceptPartial(text: string): SegmentState {
    // 首句话
    if (!this.#segmentId) {
      this.#segmentId = this.#nextId();
      this.#currentText = text;
      return { segmentId: this.#segmentId, text, isNewUtterance: true, isFinal: false };
    }

    // 公共前缀检测：新文本以旧文本开头 → 同一句话的延伸
    if (text.startsWith(this.#currentText)) {
      this.#currentText = text;
      return {
        segmentId: this.#segmentId,
        text,
        isNewUtterance: false, // 不推新弹幕
        isFinal: false,
      };
    }

    // 旧文本以新文本开头 → ASR 倒退修正（如 "I am going" → "I am"）
    if (this.#currentText.startsWith(text)) {
      this.#currentText = text;
      return {
        segmentId: this.#segmentId,
        text,
        isNewUtterance: false,
        isFinal: false,
      };
    }

    // 编辑距离判断：变化很大 → 新 utterance
    const distance = this.#levenshtein(this.#currentText, text);
    if (distance > this.#currentText.length * REPLACE_THRESHOLD) {
      // 新 utterance：flush 旧句
      this.#segmentId = this.#nextId();
      this.#currentText = text;
      return { segmentId: this.#segmentId, text, isNewUtterance: true, isFinal: false };
    }

    // 小幅修改 → 替换当前 utterance 内容（不改变 ID）
    this.#currentText = text;
    return { segmentId: this.#segmentId, text, isNewUtterance: false, isFinal: false };
  }

  acceptFinal(text: string): SegmentState {
    const id = this.#segmentId ?? this.#nextId();
    this.#segmentId = null;
    this.#currentText = "";
    return { segmentId: id, text, isNewUtterance: false, isFinal: true };
  }

  /** 重置为新会话状态，计数器归零（ID 从 seg_001 重新开始） */
  reset(): void {
    this.#segmentId = null;
    this.#currentText = "";
    this.#counter = 0;
  }

  #nextId(): string {
    return `seg_${String(++this.#counter).padStart(3, "0")}`;
  }

  /** Levenshtein 编辑距离 */
  #levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const curr = [i];
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j]! + 1,
          curr[j - 1]! + 1,
          prev[j - 1]! + cost,
        );
      }
      prev = curr;
    }
    return prev[n]!;
  }
}
