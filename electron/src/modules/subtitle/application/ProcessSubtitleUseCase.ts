// ProcessSubtitleUseCase.ts — 字幕处理用例
// 职责：接收 WebSocket 推送 → 委托 SubtitleEngine → 驱动 UI 渲染

import type { SubtitleEngine } from "../../../engine/SubtitleEngine";
import type { SubtitleSegment, CorrectionEvent } from "../../../types/subtitle";

export type RenderCallback = (segment: SubtitleSegment | null) => void;

export class ProcessSubtitleUseCase {
  constructor(
    private readonly engine: SubtitleEngine,
    private readonly onRender: RenderCallback,
  ) {}

  handleSegment(segment: SubtitleSegment): void {
    // 实时模式下，后端推送的 segment 通过 engine 管理
    // engine 持有所有 segments 并在 tick 时匹配当前时间
    this.onRender(segment);
  }

  handleCorrection(_correction: CorrectionEvent): void {
    // WebSocket 推送的修正事件委托给 engine
    // engine 在 tick 中检查 triggerAt 并执行修正
    this.onRender(null); // 触发 engine 重新评估当前 segment
  }

  handlePartial(text: string): void {
    const partialSegment: SubtitleSegment = {
      id: "_partial_",
      start: 0,
      end: 0,
      english: text,
      chinese: "",
      status: "pending",
    };
    this.onRender(partialSegment);
  }

  clear(): void {
    this.engine.stop();
  }
}
