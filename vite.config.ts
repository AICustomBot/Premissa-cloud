import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Build configuration for the AI Studio publish surface.
 *
 * This is intentionally separate from apps/web (Next.js, deployed to Vercel).
 * AI Studio publishes a static bundle, so it needs a root index.html and a
 * plain directory of assets to serve. `npm run build` emits ./dist.
 *
 * Only VITE_-prefixed variables reach the bundle, and the only one used is a
 * public API base URL. No secret, key or credential is ever inlined here.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
});
