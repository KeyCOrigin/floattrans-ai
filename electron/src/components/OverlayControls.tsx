import { memo } from "react";
import styles from "./styles/overlay-controls.module.css";

export type DisplayMode = "both" | "english-only" | "chinese-only";

interface OverlayControlsProps {
  readonly fontSize: number;
  readonly onFontSizeChange: (delta: number) => void;
  readonly isClickThrough: boolean;
  readonly onToggleClickThrough: () => void;
  readonly displayMode: DisplayMode;
  readonly onToggleDisplayMode: () => void;
}

const FONT_MIN = 10;
const FONT_MAX = 28;
const FONT_STEP = 1;

const MODE_LABELS: Record<DisplayMode, string> = {
  both: "双语",
  "english-only": "EN",
  "chinese-only": "中文",
};

export const OverlayControls = memo(function OverlayControls({
  fontSize,
  onFontSizeChange,
  isClickThrough,
  onToggleClickThrough,
  displayMode,
  onToggleDisplayMode,
}: OverlayControlsProps) {
  return (
    <div className={styles.toolbar}>
      {/* 字号调节 */}
      <button
        className={styles.btn}
        disabled={fontSize <= FONT_MIN}
        onClick={() => onFontSizeChange(-FONT_STEP)}
        title="缩小字号"
      >
        −
      </button>
      <span className={styles.label}>{fontSize}</span>
      <button
        className={styles.btn}
        disabled={fontSize >= FONT_MAX}
        onClick={() => onFontSizeChange(FONT_STEP)}
        title="放大字号"
      >
        +
      </button>

      <span className={styles.separator} />

      {/* 显示模式切换 */}
      <button
        className={styles.btn}
        onClick={onToggleDisplayMode}
        title="切换显示模式"
      >
        {displayMode === "both" ? "⇅" : displayMode === "english-only" ? "E" : "中"}
      </button>
      <span className={styles.modeLabel}>{MODE_LABELS[displayMode]}</span>

      <span className={styles.separator} />

      {/* Click-through 切换 */}
      <button
        className={`${styles.btn} ${isClickThrough ? styles.btnActive : ""}`}
        onClick={onToggleClickThrough}
        title={isClickThrough ? "点击穿透已开启" : "点击穿透已关闭"}
      >
        {isClickThrough ? "⊡" : "⊞"}
      </button>
    </div>
  );
});
