import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { e2eOrigin } from "./tests/e2e/helpers/environment";
import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.WRAPT_E2E_PORT ?? 19310);
process.env.WRAPT_E2E_PORT = String(e2ePort);
const e2eBaseURL = e2eOrigin;
// Das Web-Dist-Verzeichnis wird einmal pro Lauf angelegt und danach über die
// Umgebung weitergegeben: Worker laden diese Datei erneut aus und müssen das
// bereits gebaute Verzeichnis übernehmen, statt ein leeres anzulegen. Sonst
// liefern von Specs gestartete Zusatzserver (z. B. der zweite Workspace) nur
// „Frontend-Build ist noch nicht vorhanden" (503) aus.
const e2eWebDist = process.env.WRAPT_E2E_EXTERNAL === "true"
  ? undefined
  : process.env.WRAPT_E2E_WEB_OUT_DIR?.trim() || mkdtempSync(join(tmpdir(), "wrapt-e2e-web-"));
if (e2eWebDist) process.env.WRAPT_E2E_WEB_OUT_DIR = e2eWebDist;

if (process.env.WRAPT_E2E_URL && process.env.WRAPT_E2E_ISOLATED !== "true") {
  throw new Error(
    "WRAPT_E2E_URL darf nur auf eine isolierte Testinstanz zeigen. " +
    "Bestätige dies ausdrücklich mit WRAPT_E2E_ISOLATED=true.",
  );
}

// Harness-Specs mit eigener Isolation (Energiemodus, externe E2E-Root)
// werfen ohne ihre Umgebungsvariablen sofort. Sie laufen ausschließlich
// über ihre Harness-Konfiguration, nie im Standard-CI-Durchlauf. Die
// Desktop-Projekte definieren eigenes testIgnore und ersetzen damit die
// Top-Level-Filter — deshalb steht die Liste hier und wird je Projekt
// übernommen.
const desktopTestIgnore = [
  /responsive-shell\.spec\.ts/,
  /orbit-performance\.spec\.ts$/,
  /preview-start-performance\.spec\.ts$/,
];

export default defineConfig<object, { personaName: "frisch" | "normal" | "heavy" | "konfiguriert" }>({
  testDir: ".",
  // Der erste Navigationsaufruf lädt das komplette Workbench-Bundle. Auf dem
  // CI-Runner reicht dafür das Standardlimit nicht, ein Retry liefe dann nur
  // wieder ins selbe Limit.
  timeout: 60_000,
  fullyParallel: true,
  workers: "50%",
  // Der isolierte Launcher besitzt ein eigenes Dist-Verzeichnis; kein E2E-Lauf
  // überschreibt die Assets oder Sitzungen der aktiven Workbench.
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }], ["./tests/e2e/reporters/audit-reporter.ts"]],
  projects: [
    ...["frisch", "normal", "heavy", "konfiguriert"].map((personaName) => ({
      name: `personas-${personaName}`, testDir: "./e2e", testMatch: /journeys\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], personaName: personaName as "frisch" | "normal" | "heavy" | "konfiguriert" },
    })),
    // Die Personas-Specs verstellen globale Einstellungen (Theme, Start-App,
    // Navigation, Palette, Registry, Plugins). Jeder Worker startet zwar einen
    // eigenen Server, doch der parallele Stapel wurde unter CI-Last flaky —
    // darum laufen sie serialisiert wie die historischen Specs.
    { name: "personas", testDir: "./e2e", testIgnore: /journeys\.spec\.ts/, fullyParallel: false, workers: 1,
      use: { ...devices["Desktop Chrome"], personaName: "normal" } },
    // Historische Specs teilen sich Identitäten, Konfiguration und Orbit-Dokument.
    // Ihre Serialisierung bleibt erhalten, die neuen Personas sind workerisoliert.
    { name: "chromium", testDir: "./tests/e2e", fullyParallel: false, workers: 1,
      testIgnore: desktopTestIgnore, use: { ...devices["Desktop Chrome"] } },
    { name: "phone-touch", testDir: "./tests/e2e", fullyParallel: false, workers: 1,
      testMatch: /responsive-shell\.spec\.ts/, dependencies: ["chromium"],
      use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  use: {
    baseURL: e2eBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: process.env.WRAPT_E2E_EXTERNAL === "true" ? [] : {
    // Der Build läuft bewusst im Produktionsmodus: Die CI setzt
    // NODE_ENV=development (der Server braucht es für die
    // Entwicklungsidentität), doch die E2E-Suite soll das ausgelieferte
    // Bundle prüfen — kein Development-React mit StrictMode-Doppeleffekten.
    // Der Server selbst erbt weiterhin die Umgebung und bleibt in Entwicklung.
    command: "NODE_ENV=production pnpm build && node scripts/start-e2e-server.mjs",
    url: `${e2eBaseURL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
