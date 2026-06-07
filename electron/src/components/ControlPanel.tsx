import { useState, useRef, useEffect } from "react";
import { composeFrontend } from "../compose";
import type { FrontendSession } from "../modules/session/domain/Session.entity";
import type { InputMode } from "../modules/session/application/StartSessionUseCase";
import type { DocumentContentCallback } from "../modules/session/application/StartSessionUseCase";
import type { AudioDevice } from "../modules/audio/domain/AudioDevice.value-object";
import "../styles/control.css";

function computeStatusText(isActive: boolean): string {
  return isActive ? "监听中" : "已停止";
}

export function ControlPanel() {
  const [inputMode, setInputMode] = useState<InputMode>("microphone");
  const [isPlaying, setIsPlaying] = useState(false);

  // 样式设置
  const [opacity, setOpacity] = useState(0.85);
  const [fontSize, setFontSize] = useState(28);
  const [textColor, setTextColor] = useState("#ffffff");

  // 实时模式状态
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [permissionStatus, setPermissionStatus] = useState<string>("");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>("");

  const [deps] = useState(() => composeFrontend());
  const liveSessionRef = useRef<FrontendSession | null>(null);

  // 样式同步到 overlay
  useEffect(() => {
    window.electronAPI?.applyOverlayStyle?.({ opacity, fontSize, textColor });
  }, [opacity, fontSize, textColor]);

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

    // 打开 overlay 窗口
    window.electronAPI?.openOverlay?.();
    // 初始化样式
    window.electronAPI?.applyOverlayStyle?.({ opacity, fontSize, textColor });

    const documentCallbacks: DocumentContentCallback = {
      onContent: (markdown: string, version: number) => {
        window.electronAPI?.sendDocumentContent?.({ markdown, version });
      },
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
      documentCallbacks,
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
    setLiveError(null);
    window.electronAPI?.sendDocumentClear?.();
    window.electronAPI?.closeOverlay?.();
  };

  const handleModeSwitch = (newMode: InputMode) => {
    if (isPlaying) {
      handleStopListening();
    }
    setInputMode(newMode);
  };

  const statusText = computeStatusText(isPlaying);

  return (
    <div className="control-panel">
      <header className="control-header">
        <h1>FloatTrans AI</h1>
        <p className="subtitle-text">桌面同传文档窗口</p>
        <div className="mode-toggle">
          <button className={`mode-btn ${inputMode === "microphone" ? "active" : ""}`} onClick={() => handleModeSwitch("microphone")}>🎤 麦克风</button>
          <button className={`mode-btn ${inputMode === "system-audio" ? "active" : ""}`} onClick={() => handleModeSwitch("system-audio")}>🔊 系统音频</button>
        </div>
        <p className="status-text">状态：{statusText}</p>
      </header>

      <section className="control-section">
        {inputMode === "system-audio" && (
          <div className="hint-box">
            💡 <strong>系统音频采集需要虚拟声卡</strong>：安装
            <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer"> VB-CABLE</a> 或
            <a href="https://vb-audio.com/Voicemeeter/" target="_blank" rel="noreferrer"> Voicemeeter</a>
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
      </section>

      <section className="control-section">
        <h3>文档样式</h3>
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
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
          <span className="color-value">{textColor}</span>
        </div>
      </section>
    </div>
  );
}
