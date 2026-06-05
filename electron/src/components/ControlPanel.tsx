import { useState, useEffect, useRef, useCallback } from "react";
import { SubtitleEngine } from "../engine/SubtitleEngine";
import { demoSegments } from "../data/demoSegments";
import { demoCorrections } from "../data/demoCorrections";
import { CorrectionLog } from "./CorrectionLog";
import {
  type SubtitleSegment,
  type CorrectionLog as CorrectionLogType,
  defaultSettings,
} from "../types/subtitle";
import { composeFrontend } from "../compose";
import type { FrontendSession } from "../modules/session/domain/Session.entity";
import "../styles/control.css";

type AppMode = "demo" | "live";

function computeStatusText(mode: AppMode, isActive: boolean, hasCorrections: boolean): string {
  if (mode === "live") {
    if (isActive) return "监听中";
    return "实时模式";
  }
  if (isActive) return "播放中";
  if (hasCorrections) return "已停止";
  return "未播放";
}

const isElectronEnv = typeof window !== "undefined" && typeof window.electronAPI !== "undefined";

export function ControlPanel() {
  const engineRef = useRef<SubtitleEngine | null>(null);
  const timerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<AppMode>("demo");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleSegment | null>(null);
  const [correctionLogs, setCorrectionLogs] = useState<CorrectionLogType[]>([]);

  const [showEnglish, setShowEnglish] = useState(defaultSettings.showEnglish);
  const [showChinese, setShowChinese] = useState(defaultSettings.showChinese);
  const [opacity, setOpacity] = useState(defaultSettings.opacity);
  const [fontSize, setFontSize] = useState(defaultSettings.fontSize);
  const [subtitleColor, setSubtitleColor] = useState(defaultSettings.subtitleColor);
  const [autoCorrection, setAutoCorrection] = useState(defaultSettings.autoCorrectionEnabled);

  // 初始化引擎
  useEffect(() => {
    engineRef.current = new SubtitleEngine(demoSegments, demoCorrections);
    return () => {
      engineRef.current?.stop();
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  // autoCorrection 变更时同步到引擎
  useEffect(() => {
    engineRef.current?.setAutoCorrection(autoCorrection);
  }, [autoCorrection]);

  const emitSubtitle = useCallback(
    (segment: SubtitleSegment | null) => {
      const api = window.electronAPI;
      if (!api) return;
      api.updateSubtitle({
        english: segment?.english ?? "",
        chinese: segment?.chinese ?? "",
        status: segment?.status ?? "pending",
        showEnglish,
        showChinese,
        opacity,
        fontSize,
        subtitleColor,
      });
    },
    [showEnglish, showChinese, opacity, fontSize, subtitleColor],
  );

  // 用 ref 始终持有最新 emitSubtitle，避免 onTick 回调闭包过时
  const emitSubtitleRef = useRef(emitSubtitle);
  emitSubtitleRef.current = emitSubtitle;

  const handleStart = () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    engine.start((result) => {
      setCurrentSubtitle(result.currentSegment);
      if (result.newCorrections.length > 0) {
        setCorrectionLogs((prev) => [...prev, ...result.newCorrections]);
      }
      emitSubtitleRef.current(result.currentSegment);
    });

    setIsPlaying(true);
    timerRef.current = window.setInterval(() => {
      engineRef.current?.tick(0.1);
    }, 100);
  };

  const handlePause = () => {
    engineRef.current?.pause();
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleStop = () => {
    engineRef.current?.stop();
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentSubtitle(null);
    setCorrectionLogs([]);
    emitSubtitle(null);
  };

  const statusText = computeStatusText(mode, isPlaying, correctionLogs.length > 0);

  const handleModeSwitch = (newMode: AppMode) => {
    handleStop();
    setMode(newMode);
  };

  // 实时模式依赖（lazy init 仅执行一次）
  const [deps] = useState(() => composeFrontend());
  const liveSessionRef = useRef<FrontendSession | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const handleStartListening = async () => {
    setLiveError(null);
    const { startSessionUseCase } = deps;

    const wsEndpoint = "ws://localhost:3001";
    const result = await startSessionUseCase.execute("live", wsEndpoint);

    if (result.ok) {
      liveSessionRef.current = result.data;
      setIsPlaying(true);
    } else {
      setLiveError(result.error.message);
    }
  };

  const handleStopListening = async () => {
    const { startSessionUseCase } = deps;
    if (liveSessionRef.current) {
      await startSessionUseCase.stop(liveSessionRef.current);
    }
    liveSessionRef.current = null;
    setIsPlaying(false);
    setCurrentSubtitle(null);
    setLiveError(null);
    emitSubtitle(null);
  };

  return (
    <div className="control-panel">
      <header className="control-header">
        <h1>FloatTrans AI</h1>
        <p className="subtitle-text">极简桌面双语字幕助手</p>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === "demo" ? "active" : ""}`}
            onClick={() => handleModeSwitch("demo")}
          >
            🎬 演示
          </button>
          <button
            className={`mode-btn ${mode === "live" ? "active" : ""}`}
            onClick={() => handleModeSwitch("live")}
          >
            🎤 实时
          </button>
        </div>
        <p className="status-text">状态：{statusText}</p>
        {!isElectronEnv && (
          <div className="env-warning">
            ⚠ 请在 Electron 中运行 (npm run electron:dev)
            <br />
            当前浏览器环境不支持悬浮字幕
          </div>
        )}
      </header>

      <section className="control-section">
        {mode === "demo" ? (
          <div className="button-row">
            <button className="btn btn-play" onClick={handleStart} disabled={isPlaying}>
              ▶ 开始播放
            </button>
            <button className="btn btn-pause" onClick={handlePause} disabled={!isPlaying}>
              ⏸ 暂停
            </button>
            <button className="btn btn-stop" onClick={handleStop}>
              ⏹ 停止
            </button>
          </div>
        ) : (
          <div className="button-row">
            <button className="btn btn-play" onClick={handleStartListening} disabled={isPlaying}>
              🎤 开始监听
            </button>
            <button className="btn btn-stop" onClick={handleStopListening} disabled={!isPlaying}>
              ⏹ 停止监听
            </button>
            {liveError && <p className="live-error">{liveError}</p>}
          </div>
        )}
      </section>

      <section className="control-section">
        <h3>字幕显示</h3>
        <label className="checkbox-label">
          <input type="checkbox" checked={showEnglish} onChange={(e) => setShowEnglish(e.target.checked)} />
          英文字幕
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={showChinese} onChange={(e) => setShowChinese(e.target.checked)} />
          中文字幕
        </label>
      </section>

      <section className="control-section">
        <h3>字幕样式</h3>
        <div className="slider-group">
          <label>透明度 <span>{Math.round(opacity * 100)}%</span></label>
          <input type="range" min={10} max={100} value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
        </div>
        <div className="slider-group">
          <label>字号 <span>{fontSize}px</span></label>
          <input type="range" min={16} max={64} value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))} />
        </div>
        <div className="color-group">
          <label>颜色</label>
          <input type="color" value={subtitleColor}
            onChange={(e) => setSubtitleColor(e.target.value)} />
          <span className="color-value">{subtitleColor}</span>
        </div>
      </section>

      <section className="control-section">
        <h3>智能修正</h3>
        <label className="checkbox-label">
          <input type="checkbox" checked={autoCorrection}
            onChange={(e) => setAutoCorrection(e.target.checked)} />
          自动修正历史字幕
        </label>
      </section>

      {correctionLogs.length > 0 && (
        <section className="control-section">
          <h3>修正记录</h3>
          <div className="correction-list">
            {correctionLogs.map((log) => (
              <CorrectionLog key={log.id} log={log} />
            ))}
          </div>
        </section>
      )}

      <section className="control-section preview-section">
        <h3>当前字幕</h3>
        <div className="preview-box">
          {currentSubtitle ? (
            <>
              <p className="preview-en">{currentSubtitle.english}</p>
              <p className="preview-zh">{currentSubtitle.chinese}</p>
            </>
          ) : (
            <p className="preview-empty">未播放</p>
          )}
        </div>
      </section>
    </div>
  );
}
