// IFlytekASRService.ts — 讯飞语音转写实现 IASRService
// 封装讯飞 WebSocket 实时语音转写 API (wss://iat-api.xfyun.cn/v2/iat)
// 鉴权：基于 appId + apiKey + apiSecret 的 HMAC-SHA256 签名 URL

import type { IASRService, ASRConfig } from "../domain/IASRService.port";
import type { ASRResult } from "../domain/ASRResult.value-object";

type FinalCallback = (result: ASRResult) => void;
type PartialCallback = (text: string) => void;
type ErrorCallback = (error: Error) => void;

interface IFlytekConfig {
  readonly appId: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

type IFlytekWS = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((err: unknown) => void) | null;
  onclose: (() => void) | null;
};

export class IFlytekASRService implements IASRService {
  #onFinal: FinalCallback | null = null;
  #onPartial: PartialCallback | null = null;
  #onError: ErrorCallback | null = null;
  #isRecognizing = false;
  #ws: IFlytekWS | null = null;

  constructor(private readonly cfg: IFlytekConfig) {}

  async startRecognition(config: ASRConfig): Promise<void> {
    this.#isRecognizing = true;

    // 实际部署时取消注释：
    //
    // const crypto = await import("node:crypto");
    // const host = "iat-api.xfyun.cn";
    // const path = "/v2/iat";
    // const url = this.#buildSignedUrl(crypto, host, path);
    //
    // const WebSocketImpl = (await import("ws")).WebSocket;
    // this.#ws = new WebSocketImpl(url) as unknown as IFlytekWS;
    //
    // this.#ws.onopen = () => {
    //   // 发送开始帧
    //   this.#ws!.send(JSON.stringify({
    //     common: { app_id: this.cfg.appId },
    //     business: {
    //       language: config.language === "en-US" ? "en_us" : "zh_cn",
    //       domain: "iat",
    //       accent: "mandarin",
    //       ptt: 0,  // 不开启标点
    //     },
    //     data: {
    //       status: 0, format: "audio/L16;rate=16000", encoding: "raw",
    //       audio: "",  // 首帧不含音频数据
    //     },
    //   }));
    // };
    //
    // this.#ws.onmessage = (event) => {
    //   const msg = JSON.parse(event.data);
    //   if (msg.code !== 0) {
    //     this.#onError?.(new Error(`IFlytek ASR error: ${msg.code} ${msg.message}`));
    //     return;
    //   }
    //   if (msg.data?.status === 1 && msg.data?.result) {
    //     // 最终结果
    //     const text = msg.data.result.ws?.map((w: { cw: Array<{ w: string }> }) =>
    //       w.cw.map((c) => c.w).join("")
    //     ).join("") ?? "";
    //     this.#onFinal?.({
    //       text, isFinal: true, confidence: 0.9,
    //       startTime: msg.data.result.bg ?? 0,
    //       endTime: msg.data.result.ed ?? 0,
    //     });
    //   } else if (msg.data?.status === 0 && msg.data?.result) {
    //     // 中间结果
    //     const text = msg.data.result.ws?.map((w: { cw: Array<{ w: string }> }) =>
    //       w.cw.map((c) => c.w).join("")
    //     ).join("") ?? "";
    //     if (text) this.#onPartial?.(text);
    //   }
    //   // status === 2: 识别结束
    // };
    //
    // this.#ws.onerror = (err) => {
    //   const message = err instanceof Error ? err.message : String(err);
    //   this.#onError?.(new Error(`IFlytek WebSocket error: ${message}`));
    // };
    //
    // this.#ws.onclose = () => { this.#isRecognizing = false; };
  }

  pushAudio(chunk: ArrayBuffer): void {
    if (!this.#isRecognizing || !this.#ws) return;
    // 实际部署：Base64 编码音频数据并发送中间帧
    // const base64 = Buffer.from(chunk).toString("base64");
    // this.#ws.send(JSON.stringify({
    //   data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: base64 },
    // }));
  }

  async stopRecognition(): Promise<void> {
    this.#isRecognizing = false;
    // 实际部署：发送结束帧
    // this.#ws?.send(JSON.stringify({
    //   data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" },
    // }));
    this.#ws?.close();
    this.#ws = null;
  }

  onFinalResult(cb: FinalCallback): void { this.#onFinal = cb; }
  onPartialResult(cb: PartialCallback): void { this.#onPartial = cb; }
  onError(cb: ErrorCallback): void { this.#onError = cb; }

  // #buildSignedUrl(crypto: typeof import("node:crypto"), host: string, path: string): string {
  //   const date = new Date().toUTCString();
  //   const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  //   const signature = crypto.createHmac("sha256", this.cfg.apiSecret)
  //     .update(signatureOrigin).digest("base64");
  //   const authorizationOrigin = `api_key="${this.cfg.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  //   const authorization = Buffer.from(authorizationOrigin).toString("base64");
  //   return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
  // }
}
