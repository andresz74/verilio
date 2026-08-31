import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AppErrorBoundary } from "./app/error-boundary.js";
import { AppProviders } from "./app/providers.js";
import { router } from "./app/router.js";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root application mount");
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>
  </StrictMode>,
);

