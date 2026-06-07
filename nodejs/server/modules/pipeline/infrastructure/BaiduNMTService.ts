// BaiduNMTService.ts — 百度翻译 NMT 服务
// 实现 INMTService，低延迟英文→中文翻译（目标 < 400ms）
// 职责：纯文本映射，无上下文，无修正逻辑
//
// 百度通用翻译 API 文档：https://api.fanyi.baidu.com/doc/21
// 签名规则：MD5(appid + q + salt + secretKey)
//
// 配置环境变量：
//   NMT_PROVIDER=baidu
//   BAIDU_APP_ID=xxx
//   BAIDU_API_KEY=xxx (即 secretKey)

import crypto from "node:crypto";
import dns from "node:dns";
import type { INMTService } from "../domain/INMTService.port";
import { TranslationError } from "../../../../../shared/errors/AppError";

// 强制 IPv4 DNS 解析，避免 Windows 环境默认 IPv6 导致百度 API IP 白名单不匹配
dns.setDefaultResultOrder("ipv4first");

const BAIDU_API = "https://fanyi-api.baidu.com/api/trans/vip/translate";

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

  async translate(text: string): Promise<string> {
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

    const response = await fetch(`${BAIDU_API}?${params.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new TranslationError(
        `Baidu NMT HTTP error: ${response.status}`,
      );
    }

    const data: BaiduTranslateResponse = await response.json();

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
