import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.WRAPT_E2E_PORT ?? 3010);
const e2eBaseURL = process.env.WRAPT_E2E_URL ?? `http://127.0.0.1:${e2ePort}`;
const e2eWebDist = process.env.WRAPT_E2E_EXTERNAL === "true"
  ? undefined
  : mkdtempSync(join(tmpdir(), "wrapt-e2e-web-"));
if (e2eWebDist) process.env.WRAPT_E2E_WEB_OUT_DIR = e2eWebDist;

if (process.env.WRAPT_E2E_URL && process.env.WRAPT_E2E_ISOLATED !== "true") {
  throw new Error(
    "WRAPT_E2E_URL darf nur auf eine isolierte Testinstanz zeigen. " +
    "Bestätige dies ausdrücklich mit WRAPT_E2E_ISOLATED=true.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // Der isolierte Launcher besitzt ein eigenes Dist-Verzeichnis; kein E2E-Lauf
  // überschreibt die Assets oder Sitzungen der aktiven Workbench.
  retries: 1,
  reporter: "list",
  projects: [
    { name: "chromium", testIgnore: /responsive-shell\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Playwrights Firefox-Transport verliert bei page.reload() gelegentlich die
    // Service-Worker-Response-Bindung. Diese Suite prüft Desktop-UI, nicht PWA-Caching.
    { name: "firefox", testIgnore: /responsive-shell\.spec\.ts/, use: { ...devices["Desktop Firefox"], serviceWorkers: "block" } },
    { name: "webkit", testIgnore: /responsive-shell\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
    { name: "phone-touch", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "phone-landscape", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 844, height: 390 } } },
    { name: "ipad-portrait", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["iPad Mini"], browserName: "chromium" } },
    { name: "ipad-landscape", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["iPad Mini"], browserName: "chromium", viewport: { width: 1024, height: 768 } } },
    { name: "ipad-pro-portrait", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 1366 }, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "ipad-pro-landscape", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 1024 }, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "webkit-mobile", testMatch: /responsive-shell\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  use: {
    baseURL: e2eBaseURL,
    trace: "retain-on-failure",
  },
  webServer: process.env.WRAPT_E2E_EXTERNAL === "true" ? undefined : {
    command: "pnpm build && node scripts/start-e2e-server.mjs",
    url: `${e2eBaseURL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
