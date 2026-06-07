import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { OverlayStylePayload } from "../types/overlay";

export function TranscriptOverlay() {
  const [markdown, setMarkdown] = useState("");
  const [docVersion, setDocVersion] = useState(0);

  // 样式
  const [opacity, setOpacity] = useState(0.85);
  const [fontSize, setFontSize] = useState(28);
  const [textColor, setTextColor] = useState("#ffffff");

  // 自动滚底
  const [autoScroll, setAutoScroll] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);

  // 监听 IPC
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const onContent = (payload: unknown) => {
      const p = payload as { markdown?: string; version?: number };
      setMarkdown(p.markdown ?? "");
      setDocVersion(p.version ?? 0);
    };

    const onClear = () => {
      setMarkdown("");
      setDocVersion(0);
    };

    const onStyle = (payload: unknown) => {
      const p = payload as OverlayStylePayload;
      if (p.opacity !== undefined) setOpacity(p.opacity);
      if (p.fontSize !== undefined) setFontSize(p.fontSize);
      if (p.textColor !== undefined) setTextColor(p.textColor);
    };

    api.onDocumentContent?.(onContent);
    api.onDocumentClear?.(onClear);
    api.onOverlayApplyStyle?.(onStyle);

    return () => {
      api.removeDocumentContentListener?.(onContent);
      api.removeDocumentClearListener?.(onClear);
      api.removeOverlayApplyStyleListener?.(onStyle);
    };
  }, []);

  // 自动滚底
  useEffect(() => {
    if (autoScroll && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [markdown, autoScroll]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  return (
    <div className="overlay-container">
      <div className="overlay-header">
        <span className="overlay-title">FloatTrans AI 实时文档</span>
        {docVersion > 0 && <span className="overlay-version">v{docVersion}</span>}
      </div>
      {markdown && (
        <div
          ref={viewportRef}
          className="overlay-viewport"
          onScroll={handleScroll}
          style={{
            fontSize: `${fontSize}px`,
            color: textColor,
            opacity,
          }}
        >
          <div className="overlay-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
