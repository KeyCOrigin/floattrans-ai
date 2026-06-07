// ISessionWritePort.port.ts — 会话写入端口接口
// 职责：AudioPipeline 通过此接口回写翻译结果到 Session 聚合根
// 定义在领域层，由 compose.ts 通过 lambda 闭包适配 Session 实体
//
// 为什么用端口而非直接调用 session.addSegment：
//   Session 未来可能将 segments 存储到 Redis/数据库，
//   Pipeline 不应感知 Session 的内部存储结构。

export interface ISessionWritePort {
  /** 记录一条翻译完成的 segment，供后续 LLM 修正获取历史上下文 */
  recordSegment(segment: {
    readonly segmentId: string;
    readonly english: string;
    readonly chinese: string;
    readonly confidence: number;
  }): void;
}
