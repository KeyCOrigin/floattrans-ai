import type { CorrectionEvent } from "../types/subtitle";

export const demoCorrections: CorrectionEvent[] = [
  {
    triggerAt: 9,
    segmentId: "seg_002",
    oldEnglish: "We use rest in our backend service.",
    newEnglish: "We use Rust in our backend service.",
    oldChinese: "我们在后端服务中使用休息。",
    newChinese: "我们在后端服务中使用 Rust。",
    reason: "根据后文 Rust gives us memory safety，系统判断 rest 应为 Rust。",
    applied: false,
  },
];
