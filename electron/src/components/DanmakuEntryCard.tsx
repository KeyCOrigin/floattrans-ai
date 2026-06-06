import { useRef, useCallback } from "react";
import type { DanmakuDisplayEntry } from "../types/subtitle";
import type { DisplayMode } from "./OverlayControls";
import styles from "./styles/danmaku-entry.module.css";

interface DanmakuEntryCardProps {
  readonly entry: DanmakuDisplayEntry;
  readonly onAnimationEnd?: (id: string) => void;
  /** 显示模式：控制英文/中文的显隐 */
  readonly displayMode: DisplayMode;
}

export function DanmakuEntryCard({
  entry,
  onAnimationEnd,
  displayMode,
}: DanmakuEntryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      // 只在「推出」动画结束时才从列表中移除条目，避免 push/correct 动画结束误删
      if (e.animationName === "danmaku-fade-out") {
        onAnimationEnd?.(entry.id);
      }
    },
    [entry.id, onAnimationEnd],
  );

  const animClass = entry.animation ? styles[`anim-${entry.animation}`] : "";
  const statusClass = styles[`status-${entry.status}`];

  const showEnglish = displayMode !== "chinese-only";
  const showChinese = displayMode !== "english-only";

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${animClass} ${statusClass}`}
      onAnimationEnd={handleAnimationEnd}
    >
      {showEnglish && <span className={styles.english}>{entry.english}</span>}
      {showChinese && <span className={styles.chinese}>{entry.chinese}</span>}
    </div>
  );
}
