// EnrichedASRWord.value-object.ts — 逐词元数据值对象
// 厂商无关的词级 ASR 识别结果，由 infrastructure 层从原始响应映射

/** 词类型——语义化命名，不暴露讯飞 wp="n"/"p"/"s"/"g" 到领域层 */
export type ASRWordType = "normal" | "punctuation" | "filler" | "segment";

export interface EnrichedASRWord {
  /** 词文本 */
  readonly text: string;
  /** 词类型 */
  readonly wordType: ASRWordType;
  /** 所在片段的 type 是否为 0（确定性结果） */
  readonly isDeterministic: boolean;
  /** 词开始时间（ms） */
  readonly startMs: number;
  /** 词结束时间（ms） */
  readonly endMs: number;
}
