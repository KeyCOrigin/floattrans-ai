import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { DanmakuOverlay } from "./components/DanmakuOverlay";

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = '<div style="color:red;padding:20px">FATAL: #root missing</div>';
  throw new Error("FATAL: #root not found");
}

// 错误边界
class EB extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(e: Error) { return { err: e }; }
  render() {
    if (this.state.err) {
      return <div style={{ padding: 20, color: "#f44", fontSize: 14, background: "rgba(0,0,0,0.85)", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>REACT ERROR: {this.state.err.message}\n{this.state.err.stack}</div>;
    }
    return this.props.children;
  }
}

try {
  createRoot(rootEl).render(
    <StrictMode>
      <EB>
        <DanmakuOverlay />
      </EB>
    </StrictMode>,
  );
  console.log("%c[overlay] React mounted", "color:lime");
} catch (e) {
  rootEl.innerHTML = `<div style="color:#f44;padding:20px;background:rgba(0,0,0,0.85);font-family:monospace">FATAL: ${e instanceof Error ? e.message : String(e)}</div>`;
}
