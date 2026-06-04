import type { SubtitleSegment } from "../types/subtitle";

export const demoSegments: SubtitleSegment[] = [
  {
    id: "seg_001", start: 0, end: 4,
    english: "Today we are going to talk about container orchestration.",
    chinese: "今天我们将讨论容器编排。",
    status: "final", confidence: 0.94,
  },
  {
    id: "seg_002", start: 4, end: 8,
    english: "We use rest in our backend service.",
    chinese: "我们在后端服务中使用休息。",
    status: "final", confidence: 0.71,
  },
  {
    id: "seg_003", start: 8, end: 12,
    english: "Rust gives us memory safety and high performance.",
    chinese: "Rust 为我们提供内存安全和高性能。",
    status: "final", confidence: 0.95,
  },
  {
    id: "seg_004", start: 12, end: 16,
    english: "It also helps us reduce latency in production.",
    chinese: "它还帮助我们降低生产环境中的延迟。",
    status: "final", confidence: 0.92,
  },
  {
    id: "seg_005", start: 16, end: 20,
    english: "This is especially useful for real-time inference systems.",
    chinese: "这对于实时推理系统尤其有用。",
    status: "final", confidence: 0.93,
  },
];
