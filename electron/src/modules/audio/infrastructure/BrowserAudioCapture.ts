// BrowserAudioCapture.ts — 浏览器音频采集实现
// 统一通过 getUserMedia({ deviceId }) 采集，支持麦克风和虚拟声卡

import type { IAudioCaptureService, AudioCaptureConfig } from "../domain/IAudioCaptureService";
import type { AudioChunk } from "../domain/AudioChunk.value-object";
import type { AudioDevice } from "../domain/AudioDevice.value-object";
import { AudioCaptureError } from "../../../../../shared/errors/AppError";

type ChunkCallback = (chunk: AudioChunk) => void;

// PCM16 编码范围常量
const PCM16_NEG_MAX = 0x8000;
const PCM16_POS_MAX = 0x7FFF;
// ScriptProcessor 缓冲区大小
const PROCESSOR_BUFFER_SIZE = 4096;

export class BrowserAudioCapture implements IAudioCaptureService {
  #audioContext: AudioContext | null = null;
  #mediaStream: MediaStream | null = null;
  #processor: ScriptProcessorNode | null = null;
  #gainNode: GainNode | null = null;
  #chunkCallbacks = new Set<ChunkCallback>();
  #isActive = false;
  #permissionGranted = false;

  async enumerateDevices(): Promise<AudioDevice[]> {
    if (typeof window === "undefined") {
      throw new AudioCaptureError("Device enumeration requires a browser environment");
    }
    // 无权限时先请求权限（临时 stream 立即释放）
    if (!this.#permissionGranted) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());
        this.#permissionGranted = true;
      } catch (err) {
        throw new AudioCaptureError(
          `Microphone permission required: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput" && d.deviceId !== "")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 8)}`, groupId: d.groupId }));
  }

  async start(config: AudioCaptureConfig, deviceId: string): Promise<void> {
    if (typeof window === "undefined") {
      throw new AudioCaptureError("Audio capture requires a browser environment");
    }
    try {
      this.#mediaStream = await this.#acquireStream(deviceId, config.channels);
      this.#permissionGranted = true;
      this.#audioContext = new AudioContext({ sampleRate: config.sampleRate });
      this.#buildAudioGraph(config);
      this.#isActive = true;
    } catch (err) {
      throw new AudioCaptureError(
        `Audio capture failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  stop(): void {
    this.#isActive = false;
    try { this.#processor?.disconnect(); } catch { /* already disconnected */ }
    try { this.#gainNode?.disconnect(); } catch { /* already disconnected */ }
    this.#mediaStream?.getTracks().forEach((track) => track.stop());
    this.#audioContext?.close().catch(() => {});
    this.#processor = null;
    this.#gainNode = null;
    this.#mediaStream = null;
    this.#audioContext = null;
    this.#chunkCallbacks.clear();
  }

  onChunk(cb: ChunkCallback): void {
    this.#chunkCallbacks.add(cb);
  }

  isCapturing(): boolean {
    return this.#isActive;
  }

  // ---- 私有方法 ----

  /** 请求指定设备的音频流，不约束采样率（由 AudioContext 重采样） */
  async #acquireStream(deviceId: string, channels: number): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        channelCount: { ideal: channels },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  }

  /** 构建静默消费音频图：source → processor → gain(0) → destination */
  #buildAudioGraph(config: AudioCaptureConfig): void {
    const ctx = this.#audioContext!;
    const source = ctx.createMediaStreamSource(this.#mediaStream!);

    this.#gainNode = ctx.createGain();
    this.#gainNode.gain.value = 0;

    this.#processor = ctx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
    this.#processor.onaudioprocess = this.#createChunkCallback(config);

    source.connect(this.#processor);
    this.#processor.connect(this.#gainNode);
    this.#gainNode.connect(ctx.destination);
  }

  /** 创建 onaudioprocess 回调：Float32 → PCM16 → AudioChunk → 分发 */
  #createChunkCallback(config: AudioCaptureConfig): (event: AudioProcessingEvent) => void {
    return (event) => {
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
  }

  #float32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i] ?? 0));
      pcm16[i] = s < 0 ? s * PCM16_NEG_MAX : s * PCM16_POS_MAX;
    }
    return pcm16;
  }
}
