import { useState, useEffect, useCallback, useRef } from "react";
import { useDanmakuStream } from "../hooks/useDanmakuStream.hook";
import { DanmakuEntryCard } from "./DanmakuEntryCard";
import {
  OverlayControls,
  type DisplayMode,
} from "./OverlayControls";
import type { OverlayStylePayload } from "../types/overlay";
import styles from "./styles/danmaku-overlay.module.css";

const DEFAULT_FONT_SIZE = 14;
const FONT_MIN = 10;
const FONT_MAX = 28;
const HIDE_DELAY_MS = 400;

function styleToDisplayMode(showEnglish: boolean, showChinese: boolean): DisplayMode {
  if (showEnglish && showChinese) return "both";
  if (showEnglish) return "english-only";
  return "chinese-only";
}

function nextDisplayMode(current: DisplayMode): DisplayMode {
  const cycle: Record<DisplayMode, DisplayMode> = {
    both: "english-only",
    "english-only": "chinese-only",
    "chinese-only": "both",
  };
  return cycle[current];
}

const DEFAULT_OVERLAY_STYLE: OverlayStylePayload = {
  showEnglish: true, showChinese: true, opacity: 0.85, fontSize: DEFAULT_FONT_SIZE, subtitleColor: "#ffffff",
};

export function DanmakuOverlay() {
  const { entries, evictEntry } = useDanmakuStream();

  const [showControls, setShowControls] = useState(false);
  const [isClickThrough, setIsClickThrough] = useState(false);
  // 单一数据源：ControlPanel 通过 IPC 同步，工具栏也修改此状态
  const [overlayStyle, setOverlayStyle] = useState<OverlayStylePayload>(DEFAULT_OVERLAY_STYLE);

  // 监听 ControlPanel 的样式同步 IPC — 覆盖本地状态
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const handler = (payload: OverlayStylePayload) => {
      setOverlayStyle(payload);
    };
    api.onOverlayApplyStyle?.(handler);
    return () => {
      api.removeOverlayApplyStyleListener?.(handler);
    };
  }, []);

  // 防止工具栏出现/消失死循环：离开 container 后延迟隐藏，进入工具栏则取消
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAnimationEnd = useCallback(
    (id: string) => {
      evictEntry(id);
    },
    [evictEntry],
  );

  // --- 控制栏回调 ---

  const handleFontSizeChange = useCallback((delta: number) => {
    setOverlayStyle((prev) => ({
      ...prev,
      fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, prev.fontSize + delta)),
    }));
  }, []);

  const handleToggleDisplayMode = useCallback(() => {
    setOverlayStyle((prev) => {
      const current = styleToDisplayMode(prev.showEnglish, prev.showChinese);
      const next = nextDisplayMode(current);
      return {
        ...prev,
        showEnglish: next !== "chinese-only",
        showChinese: next !== "english-only",
      };
    });
  }, []);

  const handleToggleClickThrough = useCallback(() => {
    setIsClickThrough((prev) => {
      const next = !prev;
      window.electronAPI?.setOverlayClickThrough?.(next);
      return next;
    });
  }, []);

  // --- 悬停控制栏显隐：去抖避免 enter/leave 死循环 ---

  const handleContainerEnter = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setShowControls(true);
  }, []);

  const handleContainerLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, HIDE_DELAY_MS);
  }, []);

  const handleControlsEnter = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleControlsLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, HIDE_DELAY_MS);
  }, []);

  const displayMode = styleToDisplayMode(overlayStyle.showEnglish, overlayStyle.showChinese);

  return (
    <div
      className={styles.container}
      onMouseEnter={handleContainerEnter}
      onMouseLeave={handleContainerLeave}
    >
      {/* 悬停控制栏：独立 mouse enter/leave 防止死循环 */}
      {showControls && (
        <div
          className={styles.controlsWrapper}
          onMouseEnter={handleControlsEnter}
          onMouseLeave={handleControlsLeave}
        >
          <OverlayControls
            fontSize={overlayStyle.fontSize}
            onFontSizeChange={handleFontSizeChange}
            isClickThrough={isClickThrough}
            onToggleClickThrough={handleToggleClickThrough}
            displayMode={displayMode}
            onToggleDisplayMode={handleToggleDisplayMode}
          />
        </div>
      )}

      <div
        className={styles.entryList}
        style={{
          fontSize: `${overlayStyle.fontSize}px`,
          opacity: overlayStyle.opacity,
          color: overlayStyle.subtitleColor,
        }}
      >
        {entries.map((entry) => (
          <DanmakuEntryCard
            key={entry.id}
            entry={entry}
            displayMode={displayMode}
            onAnimationEnd={handleAnimationEnd}
          />
        ))}
      </div>
    </div>
  );
}
