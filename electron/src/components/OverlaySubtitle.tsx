import { useState, useEffect } from "react";
import type { SubtitlePayload } from "../types/subtitle";
import "../styles/overlay.css";

export function OverlaySubtitle() {
  const [subtitle, setSubtitle] = useState<SubtitlePayload | null>(null);

  useEffect(() => {
    let prevPayload = "";

    const handler = (payload: SubtitlePayload) => {
      const key = JSON.stringify(payload);
      if (key === prevPayload) return;
      prevPayload = key;
      setSubtitle(payload);
    };

    const api = window.electronAPI;
    if (!api) return;
    api.onSubtitleUpdate(handler);

    return () => {
      api.removeSubtitleUpdateListener(handler);
    };
  }, []);

  if (!subtitle) return null;

  const showEnglish = subtitle.showEnglish && subtitle.english.length > 0;
  const showChinese = subtitle.showChinese && subtitle.chinese.length > 0;
  if (!showEnglish && !showChinese) return null;

  return (
    <div
      className="subtitle-container"
      style={{
        opacity: subtitle.opacity,
        fontSize: `${subtitle.fontSize}px`,
        color: subtitle.subtitleColor,
      }}
    >
      {showEnglish && <div className="subtitle-line english">{subtitle.english}</div>}
      {showChinese && <div className="subtitle-line chinese">{subtitle.chinese}</div>}
      {subtitle.status === "revised" && (
        <div className="revised-badge">AI 已修正</div>
      )}
    </div>
  );
}
