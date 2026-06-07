// NormalizedText.value-object.ts — ASR文本归一化结果值对象

export interface NormalizedText {
  readonly original: string;
  /** 去除首部标点、填充词后的干净文本 */
  readonly normalized: string;
  /** 是否句中断片（不以大写字母或标点起始） */
  readonly isMidSentence: boolean;
}
