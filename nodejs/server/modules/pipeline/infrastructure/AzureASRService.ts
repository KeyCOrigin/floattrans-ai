// AzureASRService.ts — Azure Speech Services 实现 IASRService
// 封装 Azure Speech SDK，仅负责调用，不包含业务规则

import type { IASRService, ASRConfig, ASRFinalCallback, ASRPartialCallback, ASRErrorCallback } from "../domain/IASRService.port";

// 注意：运行时需要安装 microsoft-cognitiveservices-speech-sdk
// npm install microsoft-cognitiveservices-speech-sdk

export class AzureASRService implements IASRService {
  #onFinal: ASRFinalCallback | null = null;
  #onPartial: ASRPartialCallback | null = null;
  #onError: ASRErrorCallback | null = null;
  #isRecognizing = false;

  constructor(
    private readonly subscriptionKey: string,
    private readonly region: string,
  ) {}

  async startRecognition(config: ASRConfig): Promise<void> {
    this.#isRecognizing = true;

    // Azure Speech SDK 需要动态导入，避免非 Node 环境报错
    // 实际部署时取消注释：
    //
    // const sdk = await import("microsoft-cognitiveservices-speech-sdk");
    // const speechConfig = sdk.SpeechConfig.fromSubscription(
    //   this.subscriptionKey, this.region
    // );
    // speechConfig.speechRecognitionLanguage = config.language;
    //
    // const audioConfig = sdk.AudioConfig.fromStreamInput(/* push stream */);
    // const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    //
    // recognizer.recognizing = (_s, e) => {
    //   if (e.result.text && this.#onPartial) {
    //     this.#onPartial(e.result.text);
    //   }
    // };
    //
    // recognizer.recognized = (_s, e) => {
    //   if (e.result.reason === sdk.ResultReason.RecognizedSpeech && this.#onFinal) {
    //     this.#onFinal({
    //       text: e.result.text,
    //       isFinal: true,
    //       confidence: 0.9,
    //       startTime: e.result.offsetInTicks / 10000000,
    //       endTime: (e.result.offsetInTicks + e.result.durationInTicks) / 10000000,
    //     });
    //   }
    // };
    //
    // recognizer.canceled = (_s, e) => {
    //   if (this.#onError) {
    //     this.#onError(new Error(`ASR canceled: ${e.errorDetails}`));
    //   }
    // };
    //
    // await new Promise<void>((resolve, reject) => {
    //   recognizer.startContinuousRecognitionAsync(
    //     () => resolve(),
    //     (err) => reject(new Error(err))
    //   );
    // });
  }

  pushAudio(chunk: ArrayBuffer): void {
    if (!this.#isRecognizing) return;
    // 实际部署：pushStream.write(chunk);
    // pushStream 在 startRecognition 中创建
  }

  async stopRecognition(): Promise<void> {
    this.#isRecognizing = false;
    // 实际部署：await recognizer.stopContinuousRecognitionAsync();
  }

  onFinalResult(cb: ASRFinalCallback): void { this.#onFinal = cb; }
  onPartialResult(cb: ASRPartialCallback): void { this.#onPartial = cb; }
  onError(cb: ASRErrorCallback): void { this.#onError = cb; }
}
