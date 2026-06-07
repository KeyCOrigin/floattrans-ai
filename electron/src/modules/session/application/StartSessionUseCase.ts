// StartSessionUseCase.ts — 启动会话用例（v5: Markdown 文档流）

import { FrontendSession } from "../domain/Session.entity";
import type { IWebSocketClient, SessionAudioFormat } from "../domain/IWebSocketClient.port";
import type { IAudioCaptureService } from "../../audio/domain/IAudioCaptureService";
import type { AudioChunk } from "../../audio/domain/AudioChunk.value-object";
import { ConnectionError } from "../../../../../shared/errors/AppError";

export type InputMode = "microphone" | "system-audio";

export type StartSessionResult =
  | { ok: true; data: FrontendSession }
  | { ok: false; error: ConnectionError };

export interface DocumentContentCallback {
  onContent?: (markdown: string, version: number) => void;
}

interface WsMessage {
  type: string;
  // document:content
  markdown?: string;
  version?: number;
  // pipeline:status
  status?: string;
  detail?: string;
  // session:error
  code?: string;
  message?: string;
}

const LIVE_AUDIO_FORMAT: SessionAudioFormat = {
  sampleRate: 16000,
  bitDepth: 16,
  channels: 1,
};

export class StartSessionUseCase {
  #messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly wsClient: IWebSocketClient,
    private readonly audioCapture: IAudioCaptureService,
  ) {}

  async execute(
    _mode: InputMode,
    wsEndpoint: string,
    deviceId: string | undefined,
    onPipelineEvent?: (event: { type: "status"; status: string; detail?: string } | { type: "error"; code: string; message: string }) => void,
    documentCallbacks?: DocumentContentCallback,
  ): Promise<StartSessionResult> {
    const session = FrontendSession.create("live", wsEndpoint);

    try {
      if (!deviceId) {
        return { ok: false, error: new ConnectionError("No audio device selected") };
      }

      session.setConnecting();
      await this.wsClient.connect(wsEndpoint);

      this.#messageUnsubscribe?.();
      this.#messageUnsubscribe = this.wsClient.onMessage((data: unknown) => {
        const msg = data as WsMessage;
        if (!msg || typeof msg.type !== "string") return;

        if (msg.type === "pipeline:status" && onPipelineEvent) {
          onPipelineEvent({ type: "status", status: msg.status ?? "unknown", detail: msg.detail });
        } else if (msg.type === "session:error" && onPipelineEvent) {
          onPipelineEvent({ type: "error", code: msg.code ?? "UNKNOWN", message: msg.message ?? "" });
        } else if (msg.type === "document:content" && documentCallbacks?.onContent) {
          documentCallbacks.onContent(msg.markdown ?? "", msg.version ?? 0);
        }
      });

      this.wsClient.startSession(LIVE_AUDIO_FORMAT);
      session.setListening();

      await this.audioCapture.start(LIVE_AUDIO_FORMAT, deviceId);
      this.audioCapture.onChunk((chunk: AudioChunk) => {
        this.wsClient.sendBinary(chunk.buffer);
      });

      return { ok: true, data: session };
    } catch (err) {
      this.#messageUnsubscribe?.();
      this.#messageUnsubscribe = null;
      try { this.audioCapture.stop(); } catch { /* ignore */ }
      try { this.wsClient.disconnect(); } catch { /* ignore */ }
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
    this.#messageUnsubscribe?.();
    this.#messageUnsubscribe = null;
  }
}
