// ---- 客户端消息 ----

export interface SessionStartMessage {
  readonly type: "session:start";
  readonly mode: "demo" | "live";
  readonly audioFormat: {
    readonly sampleRate: number;
    readonly bitDepth: number;
    readonly channels: number;
  };
}

export interface SessionStopMessage {
  readonly type: "session:stop";
}

export interface AudioChunkMessage {
  readonly type: "audio:chunk";
  readonly buffer: ArrayBuffer;
  readonly timestamp: number;
  readonly sequence: number;
}

export type ClientMessage = SessionStartMessage | SessionStopMessage | AudioChunkMessage;

// ---- 服务端消息 ----

export interface SubtitlePartialMessage {
  readonly type: "subtitle:partial";
  readonly english: string;
  readonly timestamp: number;
}

export interface CorrectionPayload {
  readonly segmentId: string;
  readonly oldEnglish: string;
  readonly newEnglish: string;
  readonly oldChinese: string;
  readonly newChinese: string;
  readonly reason: string;
}

export interface SubtitleFinalMessage {
  readonly type: "subtitle:final";
  readonly segmentId: string;
  readonly english: string;
  readonly chinese: string;
  readonly confidence: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly corrections: readonly CorrectionPayload[];
}

export interface SessionErrorMessage {
  readonly type: "session:error";
  readonly code: string;
  readonly message: string;
}

export type ServerMessage =
  | SubtitlePartialMessage
  | SubtitleFinalMessage
  | SessionErrorMessage;
