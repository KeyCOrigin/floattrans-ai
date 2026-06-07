// IFlytekASRService.ts — 讯飞实时语音转写大模型 (ASR LLM)
// 封装讯飞新版 WebSocket 实时语音转写 API
// 端点：wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1
// 鉴权：HMAC-SHA1 参数排序签名 URL
// 音频：原始 PCM16 二进制帧（40ms/1280 字节）

import type { IASRService, ASRConfig, ASRFinalCallback, ASRPartialCallback, ASRErrorCallback } from "../domain/IASRService.port";
import type { ASRResult } from "../domain/ASRResult.value-object";
import type { EnrichedASRWord, ASRWordType } from "../domain/EnrichedASRWord.value-object";
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
      type?: number;       // 0=deterministic, 1=intermediate
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
  /** 已通过标点触发 final 的文本，用于去重 */
  #lastFinalizedText = "";
  /** 已 finalize 的句子精确文本集合，防止同一句因 ASR 修正被重复提交 */
  #finalizedSentences = new Set<string>();

  constructor(private readonly config: IFlytekConfig) {}

  async startRecognition(asrConfig: ASRConfig): Promise<void> {
    this.#isRecognizing = true;
    this.#audioBuffer = [];
    this.#sessionId = "";
    this.#lastFinalizedText = "";
    this.#finalizedSentences = new Set();

    const url = this.#buildSignedUrl(asrConfig);
    process.stderr.write(`[IFlytekASR] connecting to office-api-ast-dx.iflyaisol.com\n`);

    this.#ws = new WebSocketImpl(url);

    this.#ws.on("open", () => {
      process.stderr.write(`[IFlytekASR] WebSocket connected, waiting for server started...\n`);
      // 连接建立即通知就绪，前端可看到 asr_connected 状态
      this.#onReady?.();
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
        const result = this.#extractResult(d);
        if (!result.text) return;

        // DEBUG: 跟踪标点检测和 final 触发
        if (result.hasPunctuation || result.hasSegmentBreak) {
          process.stderr.write(`[IFlytekASR] detected punct/segment in result, hasPunctuation=${result.hasPunctuation}, hasSegmentBreak=${result.hasSegmentBreak}, text="${result.text.slice(0, 60)}"\n`);
        }

        // API 明确标记为 final (ls:true)
        if (d?.ls === true) {
          const lsText = result.text.trim();
          if (lsText && !this.#finalizedSentences.has(lsText)) {
            this.#finalizedSentences.add(lsText);
            this.#lastFinalizedText = lsText;
            process.stderr.write(`[IFlytekASR] ls-final: "${lsText.slice(0, 80)}"\n`);
            this.#onFinal?.(result);
          }
          return;
        }

        // 标点触发的句子结束检测（v3: 尾部残句强制 finalize）
        //
        // 讯飞 ASR 中间结果常有句中标点（逗号、前导句号）但缺少句尾标点。
        // 例如 ". When describing things in nature and scenery, there is"
        // → hasPunctuation=true，但正则 /[^.!?]+[.!?]+/g 找不到以 .?! 结尾的完整句
        // → v2 会整段丢弃，导致 70%+ 的内容丢失
        //
        // v3 修复：正则提取完整句后，尾部残句（移除前导标点）若 ≥3 词，同样强制 finalize。
        // 修正合并由 pipeline 的 TranscriptDocument.appendFinalEnglish 通过 startsWith 处理。
        const text = result.text;
        const hasEndPunct = result.hasPunctuation === true || result.hasSegmentBreak === true;

        if (hasEndPunct) {
          // 提取所有完整句子（以 .?! 结尾的片段）
          const sentenceRe = /[^.!?]+[.!?]+/g;
          let match: RegExpExecArray | null;
          let lastIndex = 0;
          let extractedCount = 0;
          while ((match = sentenceRe.exec(text)) !== null) {
            lastIndex = match.index + match[0].length;
            extractedCount++;
            const sentence = match[0].trim();
            if (!sentence) continue;

            // 精确去重：同文本已 finalize 过则跳过
            if (this.#finalizedSentences.has(sentence)) continue;

            this.#lastFinalizedText = sentence;
            this.#finalizedSentences.add(sentence);
            // 限制 Set 大小（一次会话通常 < 50 句，安全上限）
            if (this.#finalizedSentences.size > 150) {
              let count = 0;
              for (const key of this.#finalizedSentences) {
                this.#finalizedSentences.delete(key);
                if (++count >= 50) break;
              }
            }

            process.stderr.write(`[IFlytekASR] punct-final: "${sentence.slice(0, 80)}"\n`);
            const finalResult = { ...result, text: sentence };
            this.#onFinal?.(finalResult);
          }

          // v3: 尾部残句强制 finalize
          // 情况1: 已提取 N 个完整句 → 剩余文本在 lastIndex 之后
          // 情况2: 无完整句匹配 → 整段文本都是残句
          const trailing = extractedCount > 0 ? text.slice(lastIndex) : text;
          const trailingClean = trailing
            .replace(/^[.!?,\s]+/, "")   // 移除前导标点/逗号/空格
            .trim();
          const trailingWords = trailingClean.split(/\s+/).filter(w => w.length > 0);
          if (trailingWords.length >= 3 && !this.#finalizedSentences.has(trailingClean)) {
            this.#lastFinalizedText = trailingClean;
            this.#finalizedSentences.add(trailingClean);
            if (this.#finalizedSentences.size > 150) {
              let count = 0;
              for (const key of this.#finalizedSentences) {
                this.#finalizedSentences.delete(key);
                if (++count >= 50) break;
              }
            }
            process.stderr.write(`[IFlytekASR] trailing-final: "${trailingClean.slice(0, 80)}"\n`);
            const finalResult = { ...result, text: trailingClean };
            this.#onFinal?.(finalResult);
          }
        }

        // 始终发送 partial 用于前端实时显示
        this.#onPartial?.(result);
      }
    });

    this.#ws.on("error", (err: Error) => {
      process.stderr.write(`[IFlytekASR] ERROR: ${err.message}\n`);
      this.#onError?.(new ASRError(`IFlytek WebSocket error: ${err.message}`));
    });

    this.#ws.on("close", (code: number) => {
      process.stderr.write(`[IFlytekASR] WebSocket closed (code=${code})\n`);
      // 非正常关闭时通知错误
      if (code !== 1000 && code !== 1005 && this.#isRecognizing) {
        this.#onError?.(new ASRError(`IFlytek WebSocket closed unexpectedly (code=${code})`));
      }
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
          this.#onError?.(new ASRError(`IFlytek HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
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

  /**
   * 从原始响应中提取 ASRResult（含逐词元数据）
   *
   * - 映射 wp → ASRWordType（n→normal, p→punctuation, s→filler, g→segment）
   * - type=0 → isDeterministic=true
   * - 计算 hasPunctuation / hasSegmentBreak 布尔标志
   *
   * text 字段包含所有词（含标点），由 AudioPipeline 按业务需求过滤。
   */
  #extractResult(data: IFlytekASRResponseData | undefined): ASRResult {
    const cn = data?.cn;
    const stType = cn?.st?.type;
    const isDeterministic = stType === 0;
    const bg = cn?.bg ?? 0;
    const ed = cn?.ed ?? 0;

    const wpMap: Record<string, ASRWordType> = {
      n: "normal",
      p: "punctuation",
      s: "filler",
      g: "segment",
    };

    let hasPunctuation = false;
    let hasSegmentBreak = false;
    const words: EnrichedASRWord[] = [];
    const textParts: string[] = [];

    if (!cn?.st?.rt) return { text: "", isFinal: false, confidence: 0, startTime: bg, endTime: ed };

    for (const seg of cn.st.rt) {
      for (const ws of seg.ws ?? []) {
        const wb = ws.wb ?? 0;
        const we = ws.we ?? 0;
        for (const cw of ws.cw ?? []) {
          const w = cw.w ?? "";
          const wp = cw.wp ?? "n";
          const wordType: ASRWordType = wpMap[wp] ?? "normal";

          if (wordType === "punctuation") hasPunctuation = true;
          if (wordType === "segment") hasSegmentBreak = true;

          words.push({ text: w, wordType, isDeterministic, startMs: wb, endMs: we });
          textParts.push(w);
        }
      }
    }

    const text = textParts.join("");
    const isFinal = data?.ls === true;

    return { text, isFinal, confidence: 0.9, startTime: bg, endTime: ed, words, hasPunctuation, hasSegmentBreak };
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
