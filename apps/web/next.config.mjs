import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output is what Dockerfile.web runs on Cloud Run: a traced,
  // self-contained server with no dev dependencies.
  output: "standalone",
  experimental: {
    // Monorepo: trace dependencies from the repository root so the workspace
    // packages below are included in the standalone output.
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  transpilePackages: ["@permissa/contracts", "@permissa/policy"],
};

export default nextConfig;
