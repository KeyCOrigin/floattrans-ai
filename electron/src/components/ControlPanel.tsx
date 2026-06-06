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
import type {
  InputMode,
  SubtitleEvent,
  DanmakuCallbacks,
} from "../modules/session/application/StartSessionUseCase";
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

  // 叠加窗口尺寸
  const [overlayWidth, setOverlayWidth] = useState(800);
  const [overlayHeight, setOverlayHeight] = useState(400);

  const handleResizeOverlay = useCallback((w: number, h: number) => {
    const cw = Math.max(400, Math.min(1920, w));
    const ch = Math.max(100, Math.min(1080, h));
    setOverlayWidth(cw);
    setOverlayHeight(ch);
    window.electronAPI?.resizeOverlay?.(cw, ch);
  }, []);

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

  // 样式同步：ControlPanel 任何样式变更 → 立刻推送到 overlay 弹幕
  useEffect(() => {
    window.electronAPI?.applyOverlayStyle?.({
      showEnglish, showChinese, opacity, fontSize, subtitleColor,
    });
  }, [showEnglish, showChinese, opacity, fontSize, subtitleColor]);

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

  /** 保留最近一次 final 的中文翻译，避免 partial 覆盖导致闪烁 */
  const lastChineseRef = useRef<string>("");
  /** 已推入弹幕的 segment ID 集合，避免 tick 重复推送 */
  const danmakuPushedRef = useRef<Set<string>>(new Set());
  /** 实时模式：跟踪当前 partial 的弹幕 ID，确保 final 时 update 同一条目 */
  const liveDanmakuIdRef = useRef<string>("");

  // === Demo 模式 ===

  const handleStart = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    danmakuPushedRef.current.clear();
    engine.start((result) => {
      const seg = result.currentSegment;
      setCurrentSubtitle(seg);
      // 弹幕推送：首次出现的 segment
      if (seg && !danmakuPushedRef.current.has(seg.id)) {
        danmakuPushedRef.current.add(seg.id);
        window.electronAPI?.danmakuPush?.({
          id: seg.id,
          english: seg.english,
          chinese: seg.chinese,
          status: seg.status === "revised" ? "corrected"
                : seg.status === "final" ? "final" : "draft",
          confidence: seg.confidence ?? 0.9,
        });
      }
      // 弹幕修正
      if (result.newCorrections.length > 0) {
        setCorrectionLogs((prev) => [...prev, ...result.newCorrections]);
        for (const corr of result.newCorrections) {
          window.electronAPI?.danmakuCorrect?.({
            id: corr.segmentId,
            oldChinese: corr.oldChinese,
            newChinese: corr.newChinese,
          });
        }
      }
      emitSubtitleRef.current(seg);
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
    danmakuPushedRef.current.clear();
    window.electronAPI?.danmakuClear?.();
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
    // 弹幕回调：转发到 Electron 覆盖窗口
    const danmakuCallbacks: DanmakuCallbacks = {
      onDanmakuPush: (p) => window.electronAPI?.danmakuPush?.(p),
      onDanmakuUpdate: (p) => window.electronAPI?.danmakuUpdate?.(p),
      onDanmakuCorrect: (p) => window.electronAPI?.danmakuCorrect?.(p),
      onDanmakuEvict: (p) => window.electronAPI?.danmakuEvict?.(p),
      onDanmakuClear: () => window.electronAPI?.danmakuClear?.(),
    };

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
      (subtitle: SubtitleEvent) => {
        const chineseText = subtitle.isFinal ? subtitle.chinese : lastChineseRef.current;
        if (subtitle.isFinal && subtitle.chinese) {
          lastChineseRef.current = subtitle.chinese;
        }
        const seg: SubtitleSegment = {
          id: subtitle.segmentId ?? `live_${Date.now()}`,
          start: subtitle.startTime ?? 0,
          end: subtitle.endTime ?? 0,
          english: subtitle.english,
          chinese: chineseText,
          status: subtitle.isFinal ? "final" : "active",
          confidence: subtitle.confidence,
        };
        setCurrentSubtitle(seg);
        emitSubtitleRef.current(seg);

        // 同时推送到弹幕 overlay（麦克风/系统音频模式）
        // segmentId 优先；无 segmentId 时用 ref 保证 partial/final 使用同一 ID
        const danmakuId = subtitle.segmentId
          ?? (subtitle.isFinal ? liveDanmakuIdRef.current : `live_${Date.now()}`);
        if (!subtitle.isFinal && !subtitle.segmentId) {
          liveDanmakuIdRef.current = danmakuId;
        }
        if (subtitle.isFinal) {
          if (danmakuId) {
            window.electronAPI?.danmakuUpdate?.({ id: danmakuId, chinese: subtitle.chinese, isComplete: true });
          } else {
            // 无 prior partial，直接 push 一条 final 弹幕
            const fallbackId = `live_${Date.now()}`;
            window.electronAPI?.danmakuPush?.({
              id: fallbackId, english: subtitle.english, chinese: subtitle.chinese,
              status: "final", confidence: subtitle.confidence,
            });
          }
        } else {
          window.electronAPI?.danmakuPush?.({
            id: danmakuId,
            english: subtitle.english,
            chinese: "",
            status: "draft",
            confidence: subtitle.confidence,
          });
        }
      },
      danmakuCallbacks,
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
    lastChineseRef.current = "";
    liveDanmakuIdRef.current = "";
    emitSubtitleRef.current(null);
    window.electronAPI?.danmakuClear?.();
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
        <h3>叠加窗口</h3>
        <div className="slider-group">
          <label>宽度 <span>{overlayWidth}px</span></label>
          <input type="range" min={400} max={1920} step={40} value={overlayWidth} onChange={(e) => handleResizeOverlay(Number(e.target.value), overlayHeight)} />
        </div>
        <div className="slider-group">
          <label>高度 <span>{overlayHeight}px</span></label>
          <input type="range" min={100} max={1080} step={20} value={overlayHeight} onChange={(e) => handleResizeOverlay(overlayWidth, Number(e.target.value))} />
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
