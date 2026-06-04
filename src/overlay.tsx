import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlaySubtitle } from "./components/OverlaySubtitle";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlaySubtitle />
  </StrictMode>,
);
