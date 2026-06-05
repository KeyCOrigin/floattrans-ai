import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ControlPanel } from "./components/ControlPanel";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControlPanel />
  </StrictMode>,
);
