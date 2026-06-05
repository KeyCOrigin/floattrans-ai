// server/config.ts — 唯一读取 .env 的地方
// 整个系统中只有这个文件直接访问 process.env

import { ValidationError } from "../../shared/errors/AppError";

export interface AppConfig {
  readonly asrProvider: "azure" | "iflytek";
  readonly translationProvider: "openai" | "deepseek";
  readonly azure: {
    readonly key: string;
    readonly region: string;
  };
  readonly openai: {
    readonly key: string;
  };
  readonly server: {
    readonly port: number;
  };
}

function readEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readProviderEnv(key: string, allowed: readonly string[], fallback: string): string {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  if (!allowed.includes(raw)) {
    throw new ValidationError(
      `Invalid ${key}=${raw}. Allowed values: ${allowed.join(", ")}`,
    );
  }
  return raw;
}

function parsePort(raw: string): number {
  const port = parseInt(raw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ValidationError(`Invalid SERVER_PORT: ${raw}. Must be an integer between 1 and 65535.`);
  }
  return port;
}

export const config: AppConfig = {
  asrProvider: readProviderEnv("ASR_PROVIDER", ["azure", "iflytek"], "azure") as "azure" | "iflytek",
  translationProvider: readProviderEnv("TRANSLATION_PROVIDER", ["openai", "deepseek"], "openai") as "openai" | "deepseek",
  azure: {
    key: readEnv("AZURE_SPEECH_KEY"),
    region: readEnv("AZURE_SPEECH_REGION", "eastasia"),
  },
  openai: {
    key: readEnv("OPENAI_API_KEY"),
  },
  server: {
    port: parsePort(readEnv("SERVER_PORT", "3001")),
  },
};
