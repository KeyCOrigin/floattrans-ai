// INMTService.port.ts — NMT 快速翻译接口
// 定义在领域层，由基础设施层实现（百度翻译 / 火山引擎 / DeepL 等）
// 职责：纯文本映射，无上下文，无修正逻辑，低延迟（目标 < 400ms）

export interface INMTService {
  translate(text: string): Promise<string>;
}
