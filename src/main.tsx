// Self-hosted Poppins (Latin subset only) so the interface never depends on a
// third-party font CDN at runtime.
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "@/components/feedback/error-boundary";
import { registerOfflineWorker } from "@/offline/register-service-worker";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    {/* Outside the router, so a crash in the shell or a failed lazy route
        still renders a real screen instead of a blank page. */}
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// Production registers the offline shell; development registers the same worker
// in its media-only mode, so the photograph cache is exercised in the preview
// while Vite keeps ownership of the app shell and its modules.
registerOfflineWorker();
