// PipelineOutputPort.port.ts — 管道输出端口接口
// 定义在领域层，由表现层实现适配器

import type { PipelineSegment } from "./AudioPipeline.service";

export interface PipelineOutputPort {
  sendSegment(segment: PipelineSegment): void;
  sendPartial(text: string, timestamp: number): void;
  sendError(code: string, message: string): void;
  isAvailable(): boolean;
}
