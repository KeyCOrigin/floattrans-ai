// StartSessionUseCase.ts — 启动会话用例
// 职责：创建会话 → 建立 WebSocket 连接 → 初始化音频采集

import { FrontendSession } from "../domain/Session.entity";
import type { IWebSocketClient } from "../domain/IWebSocketClient.port";
import type { IAudioCaptureService } from "../../audio/domain/IAudioCaptureService";
import type { AudioChunk } from "../../audio/domain/AudioChunk.value-object";
import { ConnectionError } from "../../../../../shared/errors/AppError";

export type StartSessionResult =
  | { ok: true; data: FrontendSession }
  | { ok: false; error: ConnectionError };

export class StartSessionUseCase {
  constructor(
    private readonly wsClient: IWebSocketClient,
    private readonly audioCapture: IAudioCaptureService,
  ) {}

  async execute(mode: "demo" | "live", wsEndpoint: string): Promise<StartSessionResult> {
    try {
      const session = FrontendSession.create(mode, wsEndpoint);
      if (mode === "live") {
        session.setConnecting();
        await this.wsClient.connect(wsEndpoint);
        session.setListening();
        await this.audioCapture.start({ sampleRate: 16000, bitDepth: 16, channels: 1 });
        this.audioCapture.onChunk((chunk: AudioChunk) => {
          this.wsClient.sendBinary(chunk.buffer);
        });
      }
      return { ok: true, data: session };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: new ConnectionError(message) };
    }
  }

  async stop(session: FrontendSession): Promise<void> {
    if (session.isLive()) {
      this.audioCapture.stop();
      this.wsClient.disconnect();
      session.setStopped();
    }
  }
}
