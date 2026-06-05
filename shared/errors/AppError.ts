// ============================================================
// AppError — 应用错误基类，所有领域错误均继承此类
// 禁止 throw new Error(...)，必须使用 AppError 子类
// ============================================================

export abstract class AppError extends Error {
  public readonly code: string;
  public readonly timestamp: number;

  protected constructor(code: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", `${entity} with id '${id}' not found`);
  }
}

export class InvalidStateError extends AppError {
  constructor(currentState: string, expectedState: string, action: string) {
    super("INVALID_STATE", `Cannot '${action}' in state '${currentState}'. Expected state: '${expectedState}'.`);
  }
}

export class ConnectionError extends AppError {
  constructor(message: string) {
    super("CONNECTION_ERROR", message);
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super("TIMEOUT_ERROR", `${operation} timed out after ${timeoutMs}ms`);
  }
}

export class ASRError extends AppError {
  constructor(message: string) {
    super("ASR_ERROR", message);
  }
}

export class TranslationError extends AppError {
  constructor(message: string) {
    super("TRANSLATION_ERROR", message);
  }
}

export class AudioCaptureError extends AppError {
  constructor(message: string) {
    super("AUDIO_CAPTURE_ERROR", message);
  }
}
