// wsHandler.ts — WebSocket 事件路由
// 表现层：解析消息 → 调用应用层 UseCase → 返回响应

import type { WebSocket } from "ws";
import type { InMemorySessionRepository } from "../modules/session/infrastructure/InMemorySessionRepository";
import { Session } from "../modules/session/domain/Session.entity";
import type { AudioFormat } from "../modules/session/domain/AudioFormat.value-object";
import { AudioPipelineUseCase } from "../modules/pipeline/application/AudioPipelineUseCase";
import type { PipelineOutputPort } from "../modules/pipeline/domain/PipelineOutputPort.port";
import type { AudioPipeline } from "../modules/pipeline/domain/AudioPipeline.service";

interface RawMessage {
  type: string;
  mode?: string;
  audioFormat?: AudioFormat;
}

export interface WSHandlerDeps {
  readonly pipeline: AudioPipeline;
  readonly sessionRepo: InMemorySessionRepository;
}

const WS_OPEN = 1; // WebSocket.OPEN

function createOutputAdapter(ws: WebSocket): PipelineOutputPort {
  return {
    sendSegment(segment): void {
      ws.send(JSON.stringify({ type: "subtitle:final" as const, ...segment }));
    },
    sendPartial(text, timestamp): void {
      ws.send(JSON.stringify({ type: "subtitle:partial" as const, english: text, timestamp }));
    },
    sendError(code, message): void {
      ws.send(JSON.stringify({ type: "session:error" as const, code, message }));
    },
    isAvailable(): boolean {
      return ws.readyState === WS_OPEN;
    },
  };
}

export function createWSHandler(ws: WebSocket, deps: WSHandlerDeps) {
  const { pipeline, sessionRepo } = deps;
  const output = createOutputAdapter(ws);
  let useCase: AudioPipelineUseCase | null = null;
  let currentSession: Session | null = null;

  function register(): void {
    ws.on("message", async (data) => {
      try {
        if (data instanceof ArrayBuffer || Buffer.isBuffer(data)) {
          if (useCase && currentSession?.state === "listening") {
            const buf = data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer;
            useCase.pushAudio(buf);
          }
          return;
        }

        const msg: RawMessage = JSON.parse(data.toString());

        switch (msg.type) {
          case "session:start": {
            // 如果已有运行中的会话，先清理（finally 确保 useCase/currentSession 置 null）
            if (useCase || currentSession) {
              try {
                if (useCase) await useCase.stop();
                if (currentSession) {
                  currentSession.stop();
                  sessionRepo.save(currentSession);
                }
              } finally {
                useCase = null;
                currentSession = null;
              }
            }

            const format: AudioFormat = msg.audioFormat ?? {
              sampleRate: 16000,
              bitDepth: 16,
              channels: 1,
            };
            currentSession = Session.create(format);
            currentSession.start();
            sessionRepo.save(currentSession);
            useCase = new AudioPipelineUseCase(pipeline, output);
            await useCase.execute(currentSession);
            break;
          }

          case "session:stop": {
            if (useCase) {
              await useCase.stop();
              useCase = null;
            }
            if (currentSession) {
              currentSession.stop();
              sessionRepo.save(currentSession);
              currentSession = null;
            }
            break;
          }

          default:
            ws.send(JSON.stringify({
              type: "session:error",
              code: "UNKNOWN_MESSAGE_TYPE",
              message: `Unknown message type: ${msg.type}`,
            }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ws.send(JSON.stringify({
          type: "session:error",
          code: "HANDLER_ERROR",
          message,
        }));
      }
    });

    ws.on("close", () => {
      if (currentSession) {
        currentSession.stop();
        sessionRepo.save(currentSession);
      }
    });

    ws.on("error", (_err) => {
      // WebSocket transport error — logged by infrastructure layer
    });
  }

  return { register };
}
