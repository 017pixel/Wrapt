import { relative, resolve, isAbsolute, sep } from "node:path";
import { tmpdir } from "node:os";
import { defineConfig, devices } from "@playwright/test";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} muss für den isolierten Orbit-Performance-Lauf gesetzt sein.`);
  return value;
}

if (required("WRAPT_E2E_EXTERNAL") !== "true" || required("WRAPT_E2E_ISOLATED") !== "true") {
  throw new Error("Der Harness benötigt einen ausdrücklich isolierten, bereits laufenden E2E-Server.");
}
if (required("WRAPT_E2E_KEEP_ROOT") !== "true" || required("WRAPT_ORBIT_PERF_ALLOW_ISOLATED_RESET") !== "true") {
  throw new Error("Der Harness verlangt eine persistente E2E-Root und die ausdrückliche Freigabe, nur deren Orbit-Dokument zu ersetzen.");
}

const root = resolve(required("WRAPT_E2E_ROOT"));
const relativeRoot = relative(resolve(tmpdir()), root);
if (!relativeRoot || relativeRoot === ".." || relativeRoot.startsWith(`..${sep}`) || isAbsolute(relativeRoot)) {
  throw new Error("WRAPT_E2E_ROOT muss ein eigener Unterordner des temporären Systemverzeichnisses sein.");
}

const url = new URL(required("WRAPT_E2E_URL"));
const port = Number(required("WRAPT_E2E_PORT"));
if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || Number(url.port) !== port || port < 1_024 || port === 3_010) {
  throw new Error("WRAPT_E2E_URL muss auf 127.0.0.1 und den dedizierten, nicht standardmäßigen WRAPT_E2E_PORT zeigen.");
}
if (url.pathname !== "/" || url.search || url.hash) {
  throw new Error("WRAPT_E2E_URL muss nur den isolierten Server-Origin enthalten.");
}

const outputValue = required("WRAPT_ORBIT_PERF_OUTPUT");
if (!isAbsolute(outputValue)) throw new Error("WRAPT_ORBIT_PERF_OUTPUT muss absolut sein.");
const energyMode = required("WRAPT_ORBIT_PERF_ENERGY_MODE");
const viewportMatch = (process.env.WRAPT_ORBIT_PERF_VIEWPORT ?? "1440x960").match(/^(\d+)x(\d+)$/);
if (!viewportMatch) throw new Error("WRAPT_ORBIT_PERF_VIEWPORT muss das Format B×H haben, zum Beispiel 1440x960.");
const viewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };
if (viewport.width < 800 || viewport.height < 600) throw new Error("Der Desktop-Performance-Viewport muss mindestens 800x600 Pixel groß sein.");
const deviceScaleFactor = Number(process.env.WRAPT_ORBIT_PERF_DPR ?? "1");
if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 0.5 || deviceScaleFactor > 4) {
  throw new Error("WRAPT_ORBIT_PERF_DPR muss zwischen 0.5 und 4 liegen.");
}
if (!energyMode) throw new Error("WRAPT_ORBIT_PERF_ENERGY_MODE muss den aktuellen Energiemodus dokumentieren.");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /orbit-performance\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 1_200_000,
  reporter: "list",
  projects: [{
    name: "orbit-performance-chromium",
    use: {
      ...devices["Desktop Chrome"],
      channel: "chrome",
      launchOptions: { headless: false },
      baseURL: url.origin,
      viewport,
      deviceScaleFactor,
      hasTouch: true,
      trace: "off",
      screenshot: "off",
      video: "off",
      extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
    },
  }],
});
