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
import type { InputMode } from "../modules/session/application/StartSessionUseCase";
import type { AudioDevice } from "../modules/audio/domain/AudioDevice.value-object";
import "../styles/control.css";

type AppMode = "demo" | "microphone" | "system-audio";

function computeStatusText(mode: AppMode, isActive: boolean, hasCorrections: boolean): string {
  if (mode === "demo") {
    if (isActive) return "播放中";
    if (hasCorrections) return "已停止";
    return "未播放";
  }
  if (isActive) return "监听中";
  return "已停止";
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

  // 实时模式状态
  const [inputMode, setInputMode] = useState<InputMode>("demo");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [permissionStatus, setPermissionStatus] = useState<string>("");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>("");

  // 初始化引擎
  useEffect(() => {
    engineRef.current = new SubtitleEngine(demoSegments, demoCorrections);
    return () => {
      engineRef.current?.stop();
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

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

  const emitSubtitleRef = useRef(emitSubtitle);
  emitSubtitleRef.current = emitSubtitle;

  // === Demo 模式 ===

  const handleStart = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    engine.start((result) => {
      setCurrentSubtitle(result.currentSegment);
      if (result.newCorrections.length > 0) {
        setCorrectionLogs((prev) => [...prev, ...result.newCorrections]);
      }
      emitSubtitleRef.current(result.currentSegment);
    });
    setIsPlaying(true);
    timerRef.current = window.setInterval(() => { engineRef.current?.tick(0.1); }, 100);
  };

  const handlePause = () => {
    engineRef.current?.pause();
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsPlaying(false);
  };

  const handleDemoStop = () => {
    engineRef.current?.stop();
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsPlaying(false);
    setCurrentSubtitle(null);
    setCorrectionLogs([]);
    emitSubtitle(null);
  };

  // === 实时模式 ===

  const [deps] = useState(() => composeFrontend());
  const liveSessionRef = useRef<FrontendSession | null>(null);

  const handleRefreshDevices = async () => {
    setPermissionStatus("");
    setLiveError(null);
    try {
      const list = await deps.audioCapture.enumerateDevices();
      setDevices(list);
      if (list.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(list[0]!.deviceId);
      }
      setPermissionStatus("权限已获取");
    } catch (err) {
      setPermissionStatus("权限被拒绝");
      setLiveError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStartListening = async () => {
    setLiveError(null);
    setPipelineStatus("");
    if (!selectedDeviceId) {
      handleRefreshDevices();
      return;
    }
    const result = await deps.startSessionUseCase.execute(
      inputMode,
      "ws://localhost:3001",
      selectedDeviceId,
      (event) => {
        if (event.type === "status") {
          setPipelineStatus(event.detail ? `${event.status}: ${event.detail}` : event.status);
        } else {
          setLiveError(`[${event.code}] ${event.message}`);
        }
      },
    );
    if (result.ok) {
      liveSessionRef.current = result.data;
      setIsPlaying(true);
    } else {
      setLiveError(result.error.message);
    }
  };

  const handleStopListening = async () => {
    if (liveSessionRef.current) {
      await deps.startSessionUseCase.stop(liveSessionRef.current);
    }
    liveSessionRef.current = null;
    setIsPlaying(false);
    setCurrentSubtitle(null);
    setLiveError(null);
    emitSubtitle(null);
  };

  const handleModeSwitch = (newMode: AppMode) => {
    if (isPlaying) {
      if (inputMode === "demo") { handleDemoStop(); } else { handleStopListening(); }
    }
    setMode(newMode);
    if (newMode === "demo") {
      setInputMode("demo");
    } else if (newMode === "microphone") {
      setInputMode("microphone");
    } else {
      setInputMode("system-audio");
    }
  };

  const statusText = computeStatusText(mode, isPlaying, correctionLogs.length > 0);

  return (
    <div className="control-panel">
      <header className="control-header">
        <h1>FloatTrans AI</h1>
        <p className="subtitle-text">极简桌面双语字幕助手</p>
        <div className="mode-toggle">
          <button className={`mode-btn ${mode === "demo" ? "active" : ""}`} onClick={() => handleModeSwitch("demo")}>🎬 演示</button>
          <button className={`mode-btn ${mode === "microphone" ? "active" : ""}`} onClick={() => handleModeSwitch("microphone")}>🎤 麦克风</button>
          <button className={`mode-btn ${mode === "system-audio" ? "active" : ""}`} onClick={() => handleModeSwitch("system-audio")}>🔊 系统音频</button>
        </div>
        <p className="status-text">状态：{statusText}</p>
        {!isElectronEnv && (
          <div className="env-warning">
            ⚠ 请在 Electron 中运行 (npm run electron:dev)<br />当前浏览器环境不支持悬浮字幕
          </div>
        )}
      </header>

      <section className="control-section">
        {mode === "demo" ? (
          <div className="button-row">
            <button className="btn btn-play" onClick={handleStart} disabled={isPlaying}>▶ 开始播放</button>
            <button className="btn btn-pause" onClick={handlePause} disabled={!isPlaying}>⏸ 暂停</button>
            <button className="btn btn-stop" onClick={handleDemoStop}>⏹ 停止</button>
          </div>
        ) : (
          <>
            {mode === "system-audio" && (
              <div className="hint-box">
                💡 <strong>系统音频采集需要虚拟声卡</strong>：安装
                <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer"> VB-CABLE</a> 或
                <a href="https://vb-audio.com/Voicemeeter/" target="_blank" rel="noreferrer"> Voicemeeter</a> 后点击刷新设备，选择虚拟声卡设备即可。
              </div>
            )}
            <div className="device-row">
              <select className="device-select" value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} disabled={isPlaying}>
                <option value="">-- 请先刷新设备列表 --</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
              <button className="btn btn-refresh" onClick={handleRefreshDevices} disabled={isPlaying}>🔄 刷新</button>
            </div>
            {permissionStatus && <p className="perm-status">{permissionStatus}</p>}
            <div className="button-row">
              <button className="btn btn-play" onClick={handleStartListening} disabled={isPlaying || !selectedDeviceId}>🎤 开始监听</button>
              <button className="btn btn-stop" onClick={handleStopListening} disabled={!isPlaying}>⏹ 停止监听</button>
            </div>
            {pipelineStatus && <p className="pipeline-status">{pipelineStatus}</p>}
            {liveError && <p className="live-error">{liveError}</p>}
          </>
        )}
      </section>

      <section className="control-section">
        <h3>字幕显示</h3>
        <label className="checkbox-label">
          <input type="checkbox" checked={showEnglish} onChange={(e) => setShowEnglish(e.target.checked)} />英文字幕
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={showChinese} onChange={(e) => setShowChinese(e.target.checked)} />中文字幕
        </label>
      </section>

      <section className="control-section">
        <h3>字幕样式</h3>
        <div className="slider-group">
          <label>透明度 <span>{Math.round(opacity * 100)}%</span></label>
          <input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
        </div>
        <div className="slider-group">
          <label>字号 <span>{fontSize}px</span></label>
          <input type="range" min={16} max={64} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
        </div>
        <div className="color-group">
          <label>颜色</label>
          <input type="color" value={subtitleColor} onChange={(e) => setSubtitleColor(e.target.value)} />
          <span className="color-value">{subtitleColor}</span>
        </div>
      </section>

      <section className="control-section">
        <h3>智能修正</h3>
        <label className="checkbox-label">
          <input type="checkbox" checked={autoCorrection} onChange={(e) => setAutoCorrection(e.target.checked)} />自动修正历史字幕
        </label>
      </section>

      {correctionLogs.length > 0 && (
        <section className="control-section">
          <h3>修正记录</h3>
          <div className="correction-list">
            {correctionLogs.map((log) => (<CorrectionLog key={log.id} log={log} />))}
          </div>
        </section>
      )}

      <section className="control-section preview-section">
        <h3>当前字幕</h3>
        <div className="preview-box">
          {currentSubtitle ? (
            <><p className="preview-en">{currentSubtitle.english}</p><p className="preview-zh">{currentSubtitle.chinese}</p></>
          ) : (
            <p className="preview-empty">未播放</p>
          )}
        </div>
      </section>
    </div>
  );
}
