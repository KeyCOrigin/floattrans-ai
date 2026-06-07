// StartSessionUseCase.ts — 启动会话用例
// 职责：按模式分支（demo / microphone / system-audio）

import { FrontendSession } from "../domain/Session.entity";
import type { IWebSocketClient, SessionAudioFormat } from "../domain/IWebSocketClient.port";
import type { IAudioCaptureService } from "../../audio/domain/IAudioCaptureService";
import type { AudioChunk } from "../../audio/domain/AudioChunk.value-object";
import { ConnectionError } from "../../../../../shared/errors/AppError";
import type { DanmakuStatus } from "../../../types/subtitle";

export type InputMode = "demo" | "microphone" | "system-audio";

export type StartSessionResult =
  | { ok: true; data: FrontendSession }
  | { ok: false; error: ConnectionError };

export type PipelineStatusEvent =
  | { type: "status"; status: string; detail?: string }
  | { type: "error"; code: string; message: string };

/** 实时字幕事件：由后端 subtitle:partial / subtitle:final 消息驱动 */
export interface SubtitleEvent {
  readonly english: string;
  readonly chinese: string;
  readonly isFinal: boolean;
  readonly confidence: number;
  readonly segmentId?: string;
  readonly startTime?: number;
  readonly endTime?: number;
}

/** 弹幕事件回调接口 */
export interface DanmakuCallbacks {
  onDanmakuPush?: (payload: {
    id: string; english: string; chinese: string;
    status: DanmakuStatus; confidence: number;
  }) => void;
  onDanmakuUpdate?: (payload: {
    id: string; chinese: string; isComplete: boolean;
  }) => void;
  onDanmakuCorrect?: (payload: {
    id: string; oldChinese: string; newChinese: string;
  }) => void;
  onDanmakuEvict?: (payload: { id: string }) => void;
  onDanmakuClear?: () => void;
}

interface WsMessage {
  type: string;
  // pipeline:status
  status?: string;
  detail?: string;
  // session:error
  code?: string;
  message?: string;
  // subtitle:partial
  english?: string;
  timestamp?: number;
  // subtitle:final
  chinese?: string;
  confidence?: number;
  segmentId?: string;
  startTime?: number;
  endTime?: number;
  // danmaku:*
  id?: string;
  isComplete?: boolean;
  oldChinese?: string;
  newChinese?: string;
}

const LIVE_AUDIO_FORMAT: SessionAudioFormat = {
  sampleRate: 16000,
  bitDepth: 16,
  channels: 1,
};

export class StartSessionUseCase {
  /** onMessage 取消订阅句柄，用于 stop() 时清理避免回调泄漏 */
  #messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly wsClient: IWebSocketClient,
    private readonly audioCapture: IAudioCaptureService,
  ) {}

  async execute(
    mode: InputMode,
    wsEndpoint: string,
    deviceId: string | undefined,
    onPipelineEvent?: (event: PipelineStatusEvent) => void,
    onSubtitle?: (event: SubtitleEvent) => void,
    danmaku?: DanmakuCallbacks,
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

      // 先清理旧订阅，再注册新监听
      this.#messageUnsubscribe?.();
      // 注册消息监听，将后端状态事件与字幕事件转发给调用方
      this.#messageUnsubscribe = this.wsClient.onMessage((data: unknown) => {
        const msg = data as WsMessage;
        if (!msg || typeof msg.type !== "string") return;
        if (msg.type === "pipeline:status" && onPipelineEvent) {
          onPipelineEvent({ type: "status", status: msg.status ?? "unknown", detail: msg.detail });
        } else if (msg.type === "session:error" && onPipelineEvent) {
          onPipelineEvent({ type: "error", code: msg.code ?? "UNKNOWN", message: msg.message ?? "" });
        } else if (msg.type === "subtitle:partial" && onSubtitle) {
          onSubtitle({
            english: msg.english ?? "",
            chinese: "",
            isFinal: false,
            confidence: 0.8,
          });
        } else if (msg.type === "subtitle:final" && onSubtitle) {
          onSubtitle({
            english: msg.english ?? "",
            chinese: msg.chinese ?? "",
            isFinal: true,
            confidence: msg.confidence ?? 0.9,
            segmentId: msg.segmentId,
            startTime: msg.startTime,
            endTime: msg.endTime,
          });
        } else if (msg.type === "danmaku:push" && danmaku?.onDanmakuPush) {
          danmaku.onDanmakuPush({
            id: msg.id ?? "",
            english: msg.english ?? "",
            chinese: msg.chinese ?? "",
            status: (msg.status as DanmakuStatus) ?? "draft",
            confidence: msg.confidence ?? 0.85,
          });
        } else if (msg.type === "danmaku:update" && danmaku?.onDanmakuUpdate) {
          danmaku.onDanmakuUpdate({
            id: msg.id ?? "",
            chinese: msg.chinese ?? "",
            isComplete: msg.isComplete ?? false,
          });
        } else if (msg.type === "danmaku:correct" && danmaku?.onDanmakuCorrect) {
          danmaku.onDanmakuCorrect({
            id: msg.id ?? "",
            oldChinese: msg.oldChinese ?? "",
            newChinese: msg.newChinese ?? "",
          });
        } else if (msg.type === "danmaku:evict" && danmaku?.onDanmakuEvict) {
          danmaku.onDanmakuEvict({ id: msg.id ?? "" });
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
      // 清理已建立的连接与订阅，回滚 session 状态
      this.#messageUnsubscribe?.();
      this.#messageUnsubscribe = null;
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
    // 清理消息监听，防止回调泄漏
    this.#messageUnsubscribe?.();
    this.#messageUnsubscribe = null;
  }
}
