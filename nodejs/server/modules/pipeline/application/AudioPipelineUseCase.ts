// AudioPipelineUseCase.ts — 音频管道用例（v4）
// 编排：调领域服务 → 通过输出端口推送结果

import type { AudioPipeline } from "../domain/AudioPipeline.service";
import type { PipelineOutputPort } from "../domain/PipelineOutputPort.port";
import type { Session } from "../../session/domain/Session.entity";

export { type PipelineOutputPort };

export class AudioPipelineUseCase {
  constructor(
    private readonly pipeline: AudioPipeline,
    private readonly output: PipelineOutputPort,
  ) {}

  async execute(session: Session): Promise<void> {
    await this.pipeline.start(session, this.output);

    this.pipeline.setCallbacks(
      () => {},
      () => {},
      (error) => {
        if (this.output.isAvailable()) {
          this.output.sendError("PIPELINE_ERROR", error.message);
        }
      },
    );
  }

  pushAudio(chunk: ArrayBuffer): void {
    this.pipeline.pushAudio(chunk);
  }

  async stop(): Promise<void> {
    await this.pipeline.stop();
  }
}
