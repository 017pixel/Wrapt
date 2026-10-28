import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { e2eOrigin } from "./tests/e2e/helpers/environment";
import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.WRAPT_E2E_PORT ?? 19310);
process.env.WRAPT_E2E_PORT = String(e2ePort);
const e2eBaseURL = e2eOrigin;
const e2eExternal = process.env.WRAPT_E2E_EXTERNAL === "true" || Boolean(process.env.WRAPT_E2E_URL?.trim());
const configuredWebDist = process.env.WRAPT_E2E_WEB_OUT_DIR?.trim();
if (e2eExternal && !configuredWebDist) {
  throw new Error(
    "Ein externer E2E-Server benötigt WRAPT_E2E_WEB_OUT_DIR mit einem fertigen Web-Build. " +
    "`pnpm test:e2e` baut ihn automatisch.",
  );
}
// Ein Shard baut einmal zentral vor und startet danach nur noch Server. So
// zahlen parallele Shards den Build nicht mehrfach.
const e2ePrebuilt = process.env.WRAPT_E2E_PREBUILT === "true";
if (e2ePrebuilt && !configuredWebDist) {
  throw new Error("WRAPT_E2E_PREBUILT=true benötigt WRAPT_E2E_WEB_OUT_DIR mit einem fertigen Web-Build.");
}
// Das Web-Dist-Verzeichnis wird einmal pro Lauf angelegt und danach über die
// Umgebung weitergegeben: Worker laden diese Datei erneut aus und müssen das
// bereits gebaute Verzeichnis übernehmen, statt ein leeres anzulegen. Sonst
// liefern von Specs gestartete Zusatzserver (z. B. der zweite Workspace) nur
// „Frontend-Build ist noch nicht vorhanden" (503) aus.
const e2eWebDist = e2eExternal ? configuredWebDist : configuredWebDist || mkdtempSync(join(tmpdir(), "wrapt-e2e-web-"));
if (e2eWebDist) process.env.WRAPT_E2E_WEB_OUT_DIR = e2eWebDist;
const configuredWorkers = process.env.WRAPT_E2E_WORKERS?.trim();
const e2eWorkers = configuredWorkers
  ? Math.max(1, Number(configuredWorkers))
  : process.env.CI ? 4 : "75%";
const personaWorkers = Math.max(1, Number(process.env.WRAPT_E2E_PERSONA_WORKERS ?? (process.env.CI ? 3 : 6)));
if (!Number.isInteger(personaWorkers)) {
  throw new Error(`WRAPT_E2E_PERSONA_WORKERS ist ungültig: ${process.env.WRAPT_E2E_PERSONA_WORKERS}`);
}
// Ergebnisse und HTML-Berichte getrennter Shards dürfen sich nicht
// überschreiben; der Orchestrator setzt beide Pfade pro Shard.
const e2eResultsDir = process.env.WRAPT_E2E_RESULTS_DIR?.trim() || "test-results";
if (!Number.isFinite(Number(e2eWorkers)) && e2eWorkers !== "75%") {
  throw new Error(`WRAPT_E2E_WORKERS ist ungültig: ${configuredWorkers}`);
}

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
  /preview-start-performance\.spec\.ts$/,
];

export default defineConfig<object, { personaName: "frisch" | "normal" | "heavy" | "konfiguriert" }>({
  testDir: ".",
  // Der erste Navigationsaufruf lädt das komplette Workbench-Bundle. Auf dem
  // CI-Runner reicht dafür das Standardlimit nicht, ein Retry liefe dann nur
  // wieder ins selbe Limit.
  timeout: 60_000,
  fullyParallel: true,
  workers: e2eWorkers,
  outputDir: e2eResultsDir,
  // Der isolierte Launcher besitzt ein eigenes Dist-Verzeichnis; kein E2E-Lauf
  // überschreibt die Assets oder Sitzungen der aktiven Workbench.
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }], ["./tests/e2e/reporters/audit-reporter.ts"]],
  projects: [
    ...["frisch", "normal", "heavy", "konfiguriert"].map((personaName) => ({
      name: `personas-${personaName}`, testDir: "./e2e", testMatch: /journeys\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], personaName: personaName as "frisch" | "normal" | "heavy" | "konfiguriert" },
    })),
    // Die Einstellungs-Kreuzwirkungen laufen ebenfalls gegen je einen eigenen
    // Worker-Server. Seitdem Seeds und Reset pro Worker gekapselt sind, können
    // sie parallel laufen; nur der gemeinsame Build bleibt geteilt.
    { name: "personas", testDir: "./e2e", testIgnore: /journeys\.spec\.ts/, fullyParallel: true, workers: personaWorkers,
      use: { ...devices["Desktop Chrome"], personaName: "normal" } },
    // Historische Specs teilen sich Identitäten und Konfiguration.
    // Ihre Serialisierung bleibt erhalten, die neuen Personas sind workerisoliert.
    { name: "chromium", testDir: "./tests/e2e", fullyParallel: false, workers: 1,
      testIgnore: desktopTestIgnore, use: { ...devices["Desktop Chrome"] } },
    { name: "phone-touch", testDir: "./tests/e2e", fullyParallel: false, workers: 1,
      testMatch: /responsive-shell\.spec\.ts/, dependencies: process.env.WRAPT_E2E_SHARDED === "true" ? [] : ["chromium"],
      use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  use: {
    baseURL: e2eBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: e2eExternal ? [] : {
    // Der Build läuft bewusst im Produktionsmodus: Die CI setzt
    // NODE_ENV=development (der Server braucht es für die
    // Entwicklungsidentität), doch die E2E-Suite soll das ausgelieferte
    // Bundle prüfen — kein Development-React mit StrictMode-Doppeleffekten.
    // `build:e2e` überspringt die separate Web-Typprüfung; die läuft in der
    // statischen CI-Stufe und bei `pnpm typecheck`.
    command: e2ePrebuilt
      ? "node scripts/start-e2e-server.mjs"
      : "NODE_ENV=production pnpm build:e2e && node scripts/start-e2e-server.mjs",
    url: `${e2eBaseURL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
