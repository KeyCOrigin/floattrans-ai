// SessionState.value-object.ts — 会话状态枚举值对象

export const SessionStateEnum = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  PAUSED: "paused",
  STOPPED: "stopped",
} as const;

export type SessionStateValue = typeof SessionStateEnum[keyof typeof SessionStateEnum];
