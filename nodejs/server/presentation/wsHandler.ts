// wsHandler.ts — WebSocket 事件路由
// 表现层：解析消息 → 调用应用层 UseCase → 返回响应

import type { WebSocket } from "ws";
import type { InMemorySessionRepository } from "../modules/session/infrastructure/InMemorySessionRepository";
import { Session } from "../modules/session/domain/Session.entity";
import type { AudioFormat } from "../modules/session/domain/AudioFormat.value-object";
import { AudioPipelineUseCase } from "../modules/pipeline/application/AudioPipelineUseCase";
import type { PipelineOutputPort, PipelineStatus, DanmakuEntrySnapshot } from "../modules/pipeline/domain/PipelineOutputPort.port";
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

function log(msg: string): void {
  process.stderr.write(`[wsHandler] ${msg}\n`);
}

function createOutputAdapter(ws: WebSocket): PipelineOutputPort {
  return {
    sendSegment(segment): void {
      ws.send(JSON.stringify({ type: "subtitle:final" as const, ...segment }));
    },
    sendPartial(text, timestamp): void {
      ws.send(JSON.stringify({ type: "subtitle:partial" as const, english: text, timestamp }));
    },
    sendStatus(status: PipelineStatus, detail?: string): void {
      ws.send(JSON.stringify({ type: "pipeline:status" as const, status, detail }));
    },
    sendError(code, message): void {
      ws.send(JSON.stringify({ type: "session:error" as const, code, message }));
    },
    isAvailable(): boolean {
      return ws.readyState === WS_OPEN;
    },
    sendDanmakuPush(entry: DanmakuEntrySnapshot): void {
      ws.send(JSON.stringify({ type: "danmaku:push" as const, ...entry }));
    },
    sendDanmakuUpdate(id: string, chinese: string, isComplete: boolean): void {
      ws.send(JSON.stringify({ type: "danmaku:update" as const, id, chinese, isComplete }));
    },
    sendDanmakuCorrect(id: string, oldChinese: string, newChinese: string): void {
      ws.send(JSON.stringify({ type: "danmaku:correct" as const, id, oldChinese, newChinese }));
    },
    sendDanmakuEvict(id: string): void {
      ws.send(JSON.stringify({ type: "danmaku:evict" as const, id }));
    },
  };
}

export function createWSHandler(ws: WebSocket, deps: WSHandlerDeps) {
  const { pipeline, sessionRepo } = deps;
  const output = createOutputAdapter(ws);
  let useCase: AudioPipelineUseCase | null = null;
  let currentSession: Session | null = null;
  let audioFrameCount = 0;

  function register(): void {
    log("client connected");

    ws.on("message", async (data, isBinary) => {
      try {
        if (isBinary) {
          audioFrameCount++;
          if (audioFrameCount % 50 === 1) {
            log(`audio frames received: ${audioFrameCount}`);
          }
          if (useCase && currentSession?.state === "listening") {
            const buf = Buffer.isBuffer(data) ? (data.buffer as ArrayBuffer) : data;
            useCase.pushAudio(buf);
          }
          return;
        }

        const raw = Buffer.isBuffer(data) ? data.toString() : String(data);
        const msg: RawMessage = JSON.parse(raw);
        log(`message: type=${msg.type}`);

        switch (msg.type) {
          case "session:start": {
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

            audioFrameCount = 0;
            const format: AudioFormat = msg.audioFormat ?? {
              sampleRate: 16000,
              bitDepth: 16,
              channels: 1,
            };
            currentSession = Session.create(format);
            currentSession.start();
            sessionRepo.save(currentSession);
            useCase = new AudioPipelineUseCase(pipeline, output);
            log("launching ASR pipeline");
            await useCase.execute(currentSession);
            break;
          }

          case "session:stop": {
            log("session stop requested");
            if (useCase) {
              await useCase.stop();
              useCase = null;
            }
            if (currentSession) {
              currentSession.stop();
              sessionRepo.save(currentSession);
              currentSession = null;
            }
            audioFrameCount = 0;
            break;
          }

          default:
            log(`unknown message type: ${msg.type}`);
            ws.send(JSON.stringify({
              type: "session:error",
              code: "UNKNOWN_MESSAGE_TYPE",
              message: `Unknown message type: ${msg.type}`,
            }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`error: ${message}`);
        ws.send(JSON.stringify({
          type: "session:error",
          code: "HANDLER_ERROR",
          message,
        }));
      }
    });

    ws.on("close", () => {
      log("client disconnected");
      if (currentSession) {
        currentSession.stop();
        sessionRepo.save(currentSession);
      }
    });

    ws.on("error", (err) => {
      log(`transport error: ${err.message}`);
    });
  }

  return { register };
}
