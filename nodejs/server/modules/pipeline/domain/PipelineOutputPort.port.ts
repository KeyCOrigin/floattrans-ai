// PipelineOutputPort.port.ts — 管道输出端口接口
// 定义在领域层，由表现层实现适配器

import type { PipelineSegment } from "./AudioPipeline.service";

export type PipelineStatus =
  | "idle"
  | "asr_connecting"
  | "asr_connected"
  | "asr_error"
  | "translating"
  | "error";

/** 弹幕条目展示快照（输出端口专用） */
export interface DanmakuEntrySnapshot {
  readonly id: string;
  readonly english: string;
  readonly chinese: string;
  readonly status: "draft" | "corrected" | "final";
  readonly confidence: number;
}

export interface PipelineOutputPort {
  sendSegment(segment: PipelineSegment): void;
  sendPartial(text: string, timestamp: number): void;
  sendStatus(status: PipelineStatus, detail?: string): void;
  sendError(code: string, message: string): void;
  isAvailable(): boolean;

  /** 弹幕：新条目推入缓冲池 */
  sendDanmakuPush(entry: DanmakuEntrySnapshot): void;
  /** 弹幕：流式更新中文（增量填充） */
  sendDanmakuUpdate(id: string, chinese: string, isComplete: boolean): void;
  /** 弹幕：后台修正已显示条目 */
  sendDanmakuCorrect(id: string, oldChinese: string, newChinese: string): void;
  /** 弹幕：最旧条目被推出 */
  sendDanmakuEvict(id: string): void;
}
