import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./vitest.setup.ts"],
    env: { NODE_ENV: "test", LOG_LEVEL: "silent" },
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary"],
    thresholds: {
      statements: 60,
      branches: 45,
      functions: 60,
      lines: 65,
      "src/api/proxy.ts": { statements: 65, branches: 50, functions: 60, lines: 70 },
      "src/extensions/**/*.ts": { statements: 75, branches: 65, functions: 80, lines: 75 },
      "src/notifications/push.ts": { statements: 75, branches: 75, functions: 75, lines: 80 },
      "src/security/**/*.ts": { statements: 60, branches: 60, functions: 75, lines: 63 },
      "src/utils/websocketBridge.ts": { statements: 60, branches: 50, functions: 70, lines: 70 },
    },
  },
});
