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
    //     // ASRPartialCallback 现要求 ASRResult（含逐词元数据），
    //     // Azure 不提供词级元数据，故 words=undefined。
    //     this.#onPartial({
    //       text: e.result.text,
    //       isFinal: false,
    //       confidence: 0.5,
    //       startTime: 0,
    //       endTime: 0,
    //     });
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

  onReady(cb: () => void): void {
    // 当前 Azure ASR 为 stub（需安装 microsoft-cognitiveservices-speech-sdk）
    // 直接触发 ready 回调以便前端获取状态，但不会产生转写结果
    process.stderr.write("[AzureASR] stub mode — no real ASR results will be produced\n");
    process.stderr.write("[AzureASR] to enable: npm install microsoft-cognitiveservices-speech-sdk and uncomment implementation\n");
    cb();
  }
}
