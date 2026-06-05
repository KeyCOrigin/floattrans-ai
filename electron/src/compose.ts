// compose.ts — 前端组合根
// 唯一 new 具体实现类的地方

import { WebSocketClient } from "./modules/session/infrastructure/WebSocketClient";
import { BrowserAudioCapture } from "./modules/audio/infrastructure/BrowserAudioCapture";
import { StartSessionUseCase } from "./modules/session/application/StartSessionUseCase";
import type { IWebSocketClient } from "./modules/session/domain/IWebSocketClient.port";
import type { IAudioCaptureService } from "./modules/audio/domain/IAudioCaptureService";

export interface FrontendDependencies {
  readonly wsClient: IWebSocketClient;
  readonly audioCapture: IAudioCaptureService;
  readonly startSessionUseCase: StartSessionUseCase;
}

export function composeFrontend(): FrontendDependencies {
  const wsClient = new WebSocketClient();
  const audioCapture = new BrowserAudioCapture();
  const startSessionUseCase = new StartSessionUseCase(wsClient, audioCapture);

  return { wsClient, audioCapture, startSessionUseCase };
}
