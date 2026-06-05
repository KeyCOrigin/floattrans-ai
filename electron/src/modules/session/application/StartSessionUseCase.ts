// StartSessionUseCase.ts — 启动会话用例
// 职责：按模式分支（demo / microphone / system-audio）

import { FrontendSession } from "../domain/Session.entity";
import type { IWebSocketClient, SessionAudioFormat } from "../domain/IWebSocketClient.port";
import type { IAudioCaptureService } from "../../audio/domain/IAudioCaptureService";
import type { AudioChunk } from "../../audio/domain/AudioChunk.value-object";
import { ConnectionError } from "../../../../../shared/errors/AppError";

export type InputMode = "demo" | "microphone" | "system-audio";

export type StartSessionResult =
  | { ok: true; data: FrontendSession }
  | { ok: false; error: ConnectionError };

const LIVE_AUDIO_FORMAT: SessionAudioFormat = {
  sampleRate: 16000,
  bitDepth: 16,
  channels: 1,
};

export class StartSessionUseCase {
  constructor(
    private readonly wsClient: IWebSocketClient,
    private readonly audioCapture: IAudioCaptureService,
  ) {}

  async execute(
    mode: InputMode,
    wsEndpoint: string,
    deviceId?: string,
  ): Promise<StartSessionResult> {
    const session = FrontendSession.create(mode === "demo" ? "demo" : "live", wsEndpoint);

    try {
      if (mode === "demo") {
        return { ok: true, data: session };
      }

      // 实时模式（microphone / system-audio）
      if (!deviceId) {
        return { ok: false, error: new ConnectionError("No audio device selected") };
      }

      session.setConnecting();
      await this.wsClient.connect(wsEndpoint);
      this.wsClient.startSession(LIVE_AUDIO_FORMAT);
      session.setListening();

      await this.audioCapture.start(LIVE_AUDIO_FORMAT, deviceId);
      this.audioCapture.onChunk((chunk: AudioChunk) => {
        this.wsClient.sendBinary(chunk.buffer);
      });

      return { ok: true, data: session };
    } catch (err) {
      // 清理已建立的连接，回滚 session 状态
      try { this.audioCapture.stop(); } catch { /* 可能尚未启动 */ }
      try { this.wsClient.disconnect(); } catch { /* 静默清理 */ }
      session.setStopped();

      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: new ConnectionError(message) };
    }
  }

  async stop(session: FrontendSession): Promise<void> {
    if (session.isLive()) {
      this.audioCapture.stop();
      this.wsClient.stopSession();
      this.wsClient.disconnect();
      session.setStopped();
    }
  }
}
