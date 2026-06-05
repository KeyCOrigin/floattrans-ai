// server/config.ts — 唯一读取 .env 的地方
// 整个系统中只有这个文件直接访问 process.env

import { ValidationError } from "../../shared/errors/AppError";
import type { TranslationProviderConfig } from "./modules/pipeline/domain/TranslationProviderConfig.value-object";

// ===== ASR 供应商 =====

export type ASRProvider = "azure" | "iflytek";

// discriminated union：按 provider 字段收窄后，编译期保证字段完整
export type ASRProviderConfig =
  | { readonly provider: "azure";  readonly key: string; readonly region: string }
  | { readonly provider: "iflytek"; readonly appId: string; readonly apiKey: string; readonly apiSecret: string };

// ===== 翻译供应商模板 =====

export type TranslationProviderId = "openai" | "deepseek" | "siliconflow" | "bailian" | "zhipu";

const TRANSLATION_TEMPLATES: Record<TranslationProviderId, Omit<TranslationProviderConfig, "apiKey">> = {
  openai:       { baseUrl: "https://api.openai.com/v1/chat/completions",          model: "gpt-4o-mini" },
  deepseek:     { baseUrl: "https://api.deepseek.com/v1/chat/completions",         model: "deepseek-chat" },
  siliconflow:  { baseUrl: "https://api.siliconflow.cn/v1/chat/completions",       model: "deepseek-ai/DeepSeek-V3" },
  bailian:      { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
  zhipu:        { baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
};

// 各供应商对应的 API Key 环境变量名
const TRANSLATION_KEY_ENV: Record<TranslationProviderId, string> = {
  openai:       "OPENAI_API_KEY",
  deepseek:     "DEEPSEEK_API_KEY",
  siliconflow:  "SILICONFLOW_API_KEY",
  bailian:      "BAILIAN_API_KEY",
  zhipu:        "ZHIPU_API_KEY",
};

// ===== 应用配置 =====

export interface AppConfig {
  readonly asr: ASRProviderConfig;
  readonly translation: TranslationProviderConfig;
  readonly server: { readonly port: number };
}

// ===== 工具函数 =====

function readEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parsePort(raw: string): number {
  const port = parseInt(raw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ValidationError(`Invalid SERVER_PORT: ${raw}. Must be an integer between 1 and 65535.`);
  }
  return port;
}

// ===== 组装 =====

function readAsrConfig(): ASRProviderConfig {
  const raw = process.env["ASR_PROVIDER"];
  const provider = (raw === "azure" || raw === "iflytek") ? raw : "azure";

  if (provider === "iflytek") {
    return {
      provider: "iflytek",
      appId: readEnv("IFLYTEK_APP_ID"),
      apiKey: readEnv("IFLYTEK_API_KEY"),
      apiSecret: readEnv("IFLYTEK_API_SECRET"),
    };
  }

  return {
    provider: "azure",
    key: readEnv("AZURE_SPEECH_KEY"),
    region: readEnv("AZURE_SPEECH_REGION", "eastasia"),
  };
}

function readTranslationConfig(): TranslationProviderConfig {
  const raw = process.env["TRANSLATION_PROVIDER"];
  const allowed = Object.keys(TRANSLATION_TEMPLATES) as TranslationProviderId[];
  const provider = (allowed as string[]).includes(raw ?? "") ? (raw as TranslationProviderId) : "openai";

  const template = TRANSLATION_TEMPLATES[provider];
  const keyEnv = TRANSLATION_KEY_ENV[provider];
  const apiKey = readEnv(keyEnv);

  return { ...template, apiKey };
}

export const config: AppConfig = {
  asr: readAsrConfig(),
  translation: readTranslationConfig(),
  server: { port: parsePort(readEnv("SERVER_PORT", "3001")) },
};
