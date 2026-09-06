import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
      exclude: [
        "**/dist/**",
        "**/.next/**",
        "**/e2e/**",
        "**/*.generated.*",
        "docs/api/**",
        "infra/**",
        "**/*.config.*",
      ],
    },
  },
});
