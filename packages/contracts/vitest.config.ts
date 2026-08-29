import { defineConfig } from "vitest/config";

export default defineConfig({
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary"],
    thresholds: {
      statements: 85,
      branches: 35,
      functions: 45,
      lines: 85,
    },
  },
});
