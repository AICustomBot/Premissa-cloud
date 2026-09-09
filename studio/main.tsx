import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { configureApi } from "./api.js";
import { loadConsoleConfig } from "./config.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root is missing from index.html");
}

const root = createRoot(container);

// Configuration is fetched before the first render: Firebase cannot be
// initialised without it, and rendering a sign-in button that is not yet wired
// up would be worse than a brief blank frame.
loadConsoleConfig()
  .then((config) => {
    configureApi(config.apiBaseUrl);
    root.render(
      <React.StrictMode>
        <App config={config} />
      </React.StrictMode>,
    );
  })
  .catch((err: unknown) => {
    container.textContent =
      "The console could not load its configuration: " +
      (err instanceof Error ? err.message : "unknown error");
  });
