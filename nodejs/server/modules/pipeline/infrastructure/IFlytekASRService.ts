// IFlytekASRService.ts — 讯飞语音转写实现 IASRService
// 封装讯飞 WebSocket 实时语音转写 API (wss://iat-api.xfyun.cn/v2/iat)
// 鉴权：基于 appId + apiKey + apiSecret 的 HMAC-SHA256 签名 URL

import type { IASRService, ASRConfig, ASRFinalCallback, ASRPartialCallback, ASRErrorCallback } from "../domain/IASRService.port";
import { ASRError } from "../../../../../shared/errors/AppError";
import { WebSocket as WebSocketImpl } from "ws";
import crypto from "node:crypto";

interface IFlytekConfig {
  readonly appId: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

interface IFlytekResultWS {
  ws?: Array<{ cw: Array<{ w: string }> }>;
}

interface IFlytekResponse {
  code: number;
  message?: string;
  data?: {
    status?: number;
    result?: { bg?: number; ed?: number };
  } & IFlytekResultWS;
}

export class IFlytekASRService implements IASRService {
  #onFinal: ASRFinalCallback | null = null;
  #onPartial: ASRPartialCallback | null = null;
  #onError: ASRErrorCallback | null = null;
  #onReady: (() => void) | null = null;
  #isRecognizing = false;
  #ws: WebSocketImpl | null = null;
  #audioBuffer: ArrayBuffer[] = [];

  constructor(private readonly config: IFlytekConfig) {}

  async startRecognition(asrConfig: ASRConfig): Promise<void> {
    this.#isRecognizing = true;
    this.#audioBuffer = [];

    const host = "iat-api.xfyun.cn";
    const path = "/v2/iat";
    const url = this.#buildSignedUrl(host, path);

    this.#ws = new WebSocketImpl(url);

    const sendAudioFrame = (chunk: ArrayBuffer): void => {
      if (!this.#ws || this.#ws.readyState !== WebSocketImpl.OPEN) return;
      const base64 = Buffer.from(chunk).toString("base64");
      this.#ws.send(JSON.stringify({
        data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: base64 },
      }));
    };

    this.#ws.on("open", () => {
      this.#onReady?.();
      if (!this.#ws) return;
      this.#ws.send(JSON.stringify({
        common: { app_id: this.config.appId },
        business: {
          language: asrConfig.language === "en-US" ? "en_us" : "zh_cn",
          domain: "iat",
          accent: "mandarin",
          ptt: 0,
        },
        data: {
          status: 0, format: "audio/L16;rate=16000", encoding: "raw",
          audio: "",
        },
      }));
      // 刷新等待期间缓存的音频帧
      for (const chunk of this.#audioBuffer) { sendAudioFrame(chunk); }
      this.#audioBuffer.length = 0;
    });

    this.#ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as IFlytekResponse;
      if (msg.code !== 0) {
        this.#onError?.(new ASRError(`IFlytek ASR error: ${msg.code} ${msg.message ?? ""}`));
        return;
      }
      if (msg.data?.status === 2) return;
      const text = this.#extractText(msg.data);
      if (!text) return;
      if (msg.data?.status === 1) {
        this.#onFinal?.({
          text, isFinal: true, confidence: 0.9,
          startTime: msg.data?.result?.bg ?? 0,
          endTime: msg.data?.result?.ed ?? 0,
        });
      } else {
        this.#onPartial?.(text);
      }
    });

    this.#ws.on("error", (err: Error) => {
      this.#onError?.(new ASRError(`IFlytek WebSocket error: ${err.message}`));
    });

    this.#ws.on("close", () => {
      this.#isRecognizing = false;
      this.#ws = null;
      this.#audioBuffer.length = 0;
    });
  }

  pushAudio(chunk: ArrayBuffer): void {
    if (!this.#isRecognizing) return;
    // WS 未就绪时缓存音频帧
    if (!this.#ws || this.#ws.readyState !== 1) {
      this.#audioBuffer.push(chunk);
      return;
    }
    const base64 = Buffer.from(chunk).toString("base64");
    this.#ws.send(JSON.stringify({
      data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: base64 },
    }));
  }

  async stopRecognition(): Promise<void> {
    this.#isRecognizing = false;
    if (this.#ws && this.#ws.readyState === 1) {
      this.#ws.send(JSON.stringify({
        data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" },
      }));
      this.#ws.close();
    }
    this.#ws = null;
    this.#audioBuffer.length = 0;
  }

  onFinalResult(cb: ASRFinalCallback): void { this.#onFinal = cb; }
  onPartialResult(cb: ASRPartialCallback): void { this.#onPartial = cb; }
  onError(cb: ASRErrorCallback): void { this.#onError = cb; }
  onReady(cb: () => void): void { this.#onReady = cb; }

  #extractText(data: IFlytekResultWS | undefined): string {
    return data?.ws?.map((w) => w.cw.map((c) => c.w).join("")).join("") ?? "";
  }

  #buildSignedUrl(host: string, path: string): string {
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signature = crypto.createHmac("sha256", this.config.apiSecret)
      .update(signatureOrigin).digest("base64");
    const authorizationOrigin = [
      `api_key="${this.config.apiKey}"`,
      'algorithm="hmac-sha256"',
      'headers="host date request-line"',
      `signature="${signature}"`,
    ].join(", ");
    const authorization = Buffer.from(authorizationOrigin).toString("base64");
    return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
  }
}
