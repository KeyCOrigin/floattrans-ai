// IFlytekASRService.ts — 讯飞实时语音转写大模型 (ASR LLM)
// 封装讯飞新版 WebSocket 实时语音转写 API
// 端点：wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1
// 鉴权：HMAC-SHA1 参数排序签名 URL
// 音频：原始 PCM16 二进制帧（40ms/1280 字节）

import type { IASRService, ASRConfig, ASRFinalCallback, ASRPartialCallback, ASRErrorCallback } from "../domain/IASRService.port";
import { ASRError } from "../../../../../shared/errors/AppError";
import { WebSocket as WebSocketImpl } from "ws";
import crypto from "node:crypto";

interface IFlytekConfig {
  readonly appId: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

// 新版 ASR LLM 返回结果
// started: {"msg_type":"action","data":{"action":"started","sessionId":"xxx"}}
// result:  {"msg_type":"result","res_type":"asr","data":{"cn":{...},"ls":false}}
// error:   {"msg_type":"action","data":{"action":"error","code":"35001","desc":"..."}}
interface IFlytekASRMessage {
  msg_type?: string;     // "action" | "result"
  res_type?: string;     // "asr" (仅 result)
  data?: IFlytekASRResponseData;
}

interface IFlytekASRResponseData {
  // started/error 消息
  action?: string;       // "started" | "error"
  sessionId?: string;
  code?: string;
  desc?: string;
  // result 消息
  seg_id?: number;
  cn?: {
    st?: {
      rt?: Array<{
        ws?: Array<{
          cw?: Array<{ w?: string; wp?: string }>;
          wb?: number;
          we?: number;
        }>;
      }>;
    };
    bg?: number;
    ed?: number;
  };
  ls?: boolean; // false=部分结果, true=最终结果
}

/** 按格式生成 UTC 时间字符串（含时区偏移） */
function formatUTC(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const h = pad(Math.floor(Math.abs(offset) / 60));
  const m = pad(Math.abs(offset) % 60);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${h}${m}`;
}

export class IFlytekASRService implements IASRService {
  #onFinal: ASRFinalCallback | null = null;
  #onPartial: ASRPartialCallback | null = null;
  #onError: ASRErrorCallback | null = null;
  #onReady: (() => void) | null = null;
  #isRecognizing = false;
  #ws: WebSocketImpl | null = null;
  #audioBuffer: ArrayBuffer[] = [];
  #sessionId = "";
  #pushAudioCount = 0;

  constructor(private readonly config: IFlytekConfig) {}

  async startRecognition(asrConfig: ASRConfig): Promise<void> {
    this.#isRecognizing = true;
    this.#audioBuffer = [];
    this.#sessionId = "";

    const url = this.#buildSignedUrl(asrConfig);
    process.stderr.write(`[IFlytekASR] connecting to office-api-ast-dx.iflyaisol.com\n`);

    this.#ws = new WebSocketImpl(url);

    this.#ws.on("open", () => {
      process.stderr.write(`[IFlytekASR] WebSocket connected, waiting for server started...\n`);
    });

    this.#ws.on("message", (raw: Buffer) => {
      process.stderr.write(`[IFlytekASR] << ${raw.toString().slice(0, 200)}\n`);
      let msg: IFlytekASRMessage;
      try {
        msg = JSON.parse(raw.toString()) as IFlytekASRMessage;
      } catch {
        return;
      }

      const d = msg.data;

      // 握手响应：服务端返回 sessionId (msg_type=action, data.action=started)
      if (msg.msg_type === "action" && d?.action === "started") {
        this.#sessionId = d.sessionId ?? "";
        process.stderr.write(`[IFlytekASR] server started, sid=${this.#sessionId}, flushing ${this.#audioBuffer.length} buffered chunks\n`);
        this.#onReady?.();
        for (const chunk of this.#audioBuffer) {
          this.#sendBinaryFrame(chunk);
        }
        this.#audioBuffer.length = 0;
        return;
      }

      // 错误 (msg_type=action, data.action=error)
      if (msg.msg_type === "action" && d?.action === "error") {
        this.#onError?.(new ASRError(
          `IFlytek ASR error: ${d.code ?? ""} ${d.desc ?? ""}`
        ));
        return;
      }

      // 转写结果 (msg_type=result)
      if (msg.msg_type === "result") {
        const text = this.#extractText(d);
        if (!text) return;
        const bg = d?.cn?.bg ?? 0;
        const ed = d?.cn?.ed ?? 0;
        // ls 在 data 层级
        if (d?.ls === true) {
          process.stderr.write(`[IFlytekASR] final result: "${text}"\n`);
          this.#onFinal?.({
            text, isFinal: true, confidence: 0.9,
            startTime: bg, endTime: ed,
          });
        } else {
          this.#onPartial?.(text);
        }
      }
    });

    this.#ws.on("error", (err: Error) => {
      process.stderr.write(`[IFlytekASR] ERROR: ${err.message}\n`);
      this.#onError?.(new ASRError(`IFlytek WebSocket error: ${err.message}`));
    });

    this.#ws.on("close", (code: number) => {
      process.stderr.write(`[IFlytekASR] WebSocket closed (code=${code})\n`);
      this.#isRecognizing = false;
      this.#ws = null;
      this.#audioBuffer.length = 0;
    });

    // 捕获非 101 的 HTTP 响应（ws 库的 unexpected-response 事件）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsAny = this.#ws as any;
    if (typeof wsAny.on === "function") {
      wsAny.on("unexpected-response", (_req: unknown, res: { statusCode: number; on: (e: string, cb: (...args: unknown[]) => void) => void }) => {
        let body = "";
        res.on("data", (c: unknown) => { body += String(c); });
        res.on("end", () => {
          process.stderr.write(`[IFlytekASR] HTTP ${res.statusCode}: ${body.slice(0, 200)}\n`);
        });
      });
    }
  }

  pushAudio(chunk: ArrayBuffer): void {
    if (!this.#isRecognizing) return;
    if (!this.#ws || this.#ws.readyState !== 1 || !this.#sessionId) {
      this.#audioBuffer.push(chunk);
      if (this.#audioBuffer.length === 1 || this.#audioBuffer.length % 50 === 0) {
        process.stderr.write(`[IFlytekASR] buffering audio (${this.#audioBuffer.length} chunks waiting for session)\n`);
      }
      return;
    }
    this.#pushAudioCount++;
    if (this.#pushAudioCount % 50 === 1) {
      process.stderr.write(`[IFlytekASR] sent ${this.#pushAudioCount} audio chunks (${chunk.byteLength}B each)\n`);
    }
    this.#sendBinaryFrame(chunk);
  }

  async stopRecognition(): Promise<void> {
    this.#isRecognizing = false;
    if (this.#ws && this.#ws.readyState === 1 && this.#sessionId) {
      // 新版 API：发送结束标识
      this.#ws.send(JSON.stringify({ end: true, sessionId: this.#sessionId }));
      setTimeout(() => {
        this.#ws?.close();
        this.#ws = null;
      }, 500);
    } else {
      this.#ws?.close();
      this.#ws = null;
    }
    this.#audioBuffer.length = 0;
  }

  onFinalResult(cb: ASRFinalCallback): void { this.#onFinal = cb; }
  onPartialResult(cb: ASRPartialCallback): void { this.#onPartial = cb; }
  onError(cb: ASRErrorCallback): void { this.#onError = cb; }
  onReady(cb: () => void): void { this.#onReady = cb; }

  // ---- 私有方法 ----

  #sendBinaryFrame(chunk: ArrayBuffer): void {
    if (!this.#ws || this.#ws.readyState !== 1) return;
    this.#ws.send(chunk);
  }

  #extractText(data: IFlytekASRResponseData | undefined): string {
    if (!data?.cn?.st?.rt) return "";
    return data.cn.st.rt
      .map((seg) =>
        (seg.ws ?? [])
          .map((w) => (w.cw ?? []).map((c) => c.w ?? "").join(""))
          .join("")
      )
      .join("");
  }

  #buildSignedUrl(asrConfig: ASRConfig): string {
    const baseUrl = "wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1";
    const uuid = crypto.randomUUID();

    const params: Record<string, string> = {
      accessKeyId: this.config.apiKey,
      appId: this.config.appId,
      audio_encode: "pcm_s16le",
      // autodialect 可中英混合识别；单独 en/zh 需在控制台开通对应语种
      lang: "autodialect",
      samplerate: String(asrConfig.sampleRate),
      utc: formatUTC(),
      uuid,
    };

    // 按参数名升序排序 → URL 编码 → & 拼接 = baseString
    const sortedKeys = Object.keys(params).sort();
    const baseString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`)
      .join("&");

    // HMAC-SHA1 签名 → Base64
    const signature = crypto
      .createHmac("sha1", this.config.apiSecret)
      .update(baseString)
      .digest("base64");

    const queryString =
      baseString + `&${encodeURIComponent("signature")}=${encodeURIComponent(signature)}`;

    return `${baseUrl}?${queryString}`;
  }
}
