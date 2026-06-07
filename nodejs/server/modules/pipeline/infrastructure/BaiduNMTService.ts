// BaiduNMTService.ts — 百度翻译 NMT 服务
// 实现 INMTService，低延迟英文→中文翻译
//
// v2 改进：
//   - AbortSignal.timeout(2500) 防止请求挂起
//   - 耗时日志：区分网络等待 vs 百度处理
//   - Node.js 内置 fetch 默认连接复用（undici keep-alive 5s）

import crypto from "node:crypto";
import dns from "node:dns";
import type { INMTService, NmtTranslateContext } from "../domain/INMTService.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

// 强制 IPv4 DNS 解析，避免 Windows 环境默认 IPv6 导致百度 API IP 白名单不匹配
dns.setDefaultResultOrder("ipv4first");

const BAIDU_API = "https://fanyi-api.baidu.com/api/trans/vip/translate";
const NMT_TIMEOUT_MS = 2500;

interface BaiduTranslateResponse {
  from?: string;
  to?: string;
  trans_result?: Array<{ src: string; dst: string }>;
  error_code?: string;
  error_msg?: string;
}

export class BaiduNMTService implements INMTService {
  constructor(
    private readonly appId: string,
    private readonly secretKey: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async translate(text: string, _ctx?: NmtTranslateContext): Promise<string> {
    // 未配置凭据时抛出明确错误，优于调用远端后返回签名错误
    if (!this.appId || !this.secretKey) {
      throw new TranslationError(
        "Baidu NMT not configured. Set NMT_PROVIDER=baidu and provide BAIDU_APP_ID / BAIDU_API_KEY in .env",
      );
    }

    if (!text.trim()) return text.trim();

    const salt = String(Math.floor(Math.random() * 90000) + 10000);

    // 百度签名：MD5(appid + q + salt + secretKey)
    const signStr = this.appId + text + salt + this.secretKey;
    const sign = crypto.createHash("md5").update(signStr, "utf8").digest("hex");

    const params = new URLSearchParams({
      q: text,
      from: "en",
      to: "zh",
      appid: this.appId,
      salt,
      sign,
    });

    const startMs = Date.now();

    let response: Response;
    try {
      response = await fetch(`${BAIDU_API}?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(NMT_TIMEOUT_MS),
      });
    } catch (err) {
      const elapsed = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof DOMException && err.name === "TimeoutError") {
        process.stderr.write(`[BaiduNMT] TIMEOUT after ${elapsed}ms: "${text.slice(0, 50)}"\n`);
        throw new TranslationError(`Baidu NMT timeout after ${NMT_TIMEOUT_MS}ms`);
      }
      process.stderr.write(`[BaiduNMT] FETCH ERROR after ${elapsed}ms: ${message}\n`);
      throw new TranslationError(`Baidu NMT fetch error: ${message}`);
    }

    const networkMs = Date.now() - startMs;

    if (!response.ok) {
      throw new TranslationError(`Baidu NMT HTTP error: ${response.status}`);
    }

    const data: BaiduTranslateResponse = await response.json();
    const totalMs = Date.now() - startMs;

    process.stderr.write(
      `[BaiduNMT] network=${networkMs}ms json=${totalMs - networkMs}ms ` +
      `total=${totalMs}ms text="${text.slice(0, 40)}"\n`,
    );

    if (data.error_code) {
      throw new TranslationError(
        `Baidu NMT error [${data.error_code}]: ${data.error_msg ?? "unknown"}`,
      );
    }

    const result = data.trans_result?.[0]?.dst;
    if (!result) {
      // 极端情况：百度返回空译文，回退原文
      return text;
    }

    return result;
  }
}
