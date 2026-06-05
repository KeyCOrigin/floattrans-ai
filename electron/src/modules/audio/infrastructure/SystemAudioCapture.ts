// SystemAudioCapture.ts — 系统音频采集实现
// 封装浏览器 AudioContext / MediaStream API
// Electron 环境下采集系统音频（loopback）

import type { IAudioCaptureService, AudioCaptureConfig } from "../domain/IAudioCaptureService";
import type { AudioChunk } from "../domain/AudioChunk.value-object";
import { AudioCaptureError } from "../../../../../shared/errors/AppError";

type ChunkCallback = (chunk: AudioChunk) => void;

export class SystemAudioCapture implements IAudioCaptureService {
  #audioContext: AudioContext | null = null;
  #mediaStream: MediaStream | null = null;
  #processor: ScriptProcessorNode | null = null;
  #chunkCallbacks = new Set<ChunkCallback>();
  #isActive = false;

  async start(config: AudioCaptureConfig): Promise<void> {
    try {
      if (typeof window !== "undefined") {
        this.#mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: config.sampleRate,
            channelCount: config.channels,
            echoCancellation: false,
            noiseSuppression: false,
          },
        });
      }

      this.#audioContext = new AudioContext({ sampleRate: config.sampleRate });
      if (!this.#mediaStream) throw new AudioCaptureError("MediaStream not initialized");
      const source = this.#audioContext.createMediaStreamSource(this.#mediaStream);

      this.#processor = this.#audioContext.createScriptProcessor(4096, 1, 1);
      this.#processor.onaudioprocess = (event) => {
        if (!this.#isActive) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const buffer = this.#float32ToPCM16(inputData);
        const ab = new ArrayBuffer(buffer.byteLength);
        new Int16Array(ab).set(buffer);
        const chunk: AudioChunk = {
          buffer: ab,
          timestamp: Date.now(),
          duration: inputData.length / config.sampleRate,
        };
        this.#chunkCallbacks.forEach((cb) => cb(chunk));
      };

      source.connect(this.#processor);
      // 不连接到 destination 以避免音频反馈回路
      // 只读取数据，不播放
      this.#isActive = true;
    } catch (err) {
      throw new AudioCaptureError(
        `Audio capture failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  stop(): void {
    this.#isActive = false;
    this.#processor?.disconnect();
    this.#mediaStream?.getTracks().forEach((track) => track.stop());
    this.#audioContext?.close();
    this.#processor = null;
    this.#mediaStream = null;
    this.#audioContext = null;
  }

  onChunk(cb: ChunkCallback): void {
    this.#chunkCallbacks.add(cb);
  }

  isCapturing(): boolean {
    return this.#isActive;
  }

  #float32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i] ?? 0));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
  }
}
