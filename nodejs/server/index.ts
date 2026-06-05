// server/index.ts — 后端入口
// 职责：启动 WebSocket 服务器，装配依赖

import "dotenv/config";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { compose } from "./compose";
import { createWSHandler } from "./presentation/wsHandler";

const port = config.server.port;
const wss = new WebSocketServer({ port });

const deps = compose();

wss.on("connection", (ws) => {
  const handler = createWSHandler(ws, {
    pipeline: deps.pipeline,
    sessionRepo: deps.sessionRepo,
  });
  handler.register();
});

process.stderr.write(`[FloatTrans Server] WebSocket server listening on ws://localhost:${port}\n`);
