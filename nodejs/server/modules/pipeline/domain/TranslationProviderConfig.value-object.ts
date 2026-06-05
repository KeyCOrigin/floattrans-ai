// TranslationProviderConfig.value-object.ts — 翻译供应商通用配置值对象
// 不绑定任何特定供应商

export interface TranslationProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}
