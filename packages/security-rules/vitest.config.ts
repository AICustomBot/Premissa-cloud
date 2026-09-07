import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts"],
    // The emulator is slow to start on a cold CI runner.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Rules tests share one emulator instance and one rules file, so they
    // must not run in parallel processes.
    fileParallelism: false,
  },
});
