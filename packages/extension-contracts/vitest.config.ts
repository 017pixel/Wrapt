import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary"],
    thresholds: { statements: 95, branches: 90, functions: 95, lines: 96 },
  },
});
