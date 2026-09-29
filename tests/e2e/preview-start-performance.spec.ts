import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { arch, release, tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { previewIdentity, previewsEnabled, previewsReason } from "./helpers/previews";

const repetitions = 5;
const spaText = "Preview-Messfixture bereit";

function percentile(values: number[], rank: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * rank;
  const lower = Math.floor(position);
  const fraction = position - lower;
  const left = sorted[lower] ?? 0;
  const right = sorted[Math.min(lower + 1, sorted.length - 1)] ?? left;
  return Math.round((left + (right - left) * fraction) * 10) / 10;
}

function summarize(values: number[]) {
  return {
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
  };
}

test.describe("Preview-Start-Performance", () => {
  test.skip(!previewsEnabled, previewsReason);

  test("misst fünf kalte Starts bis zum ersten gerenderten Fixture-Inhalt", async ({ page, request }) => {
    test.setTimeout(240_000);
    const energyMode = process.env.WRAPT_PREVIEW_START_ENERGY_MODE?.trim();
    if (!energyMode) throw new Error("Setze WRAPT_PREVIEW_START_ENERGY_MODE, z. B. 'Netzbetrieb; Low-Power aus'.");
    const runtimeDirectory = await mkdtemp(join(process.cwd(), "tests", "fixtures", ".e2e-preview-start-"));
    const reportDirectory = await mkdtemp(join(tmpdir(), "wrapt-preview-start-"));
    let projectId: string | null = null;

    const reclaimFixtureSlots = async () => {
      // Der isolierte E2E-Server hat eine eigene Datenbank. Slots werden erst
      // nach dem Schließen unserer Laufzeitsitzung als zurücksetzbar freigegeben.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const reclaim = await request.post("/api/v1/previews/slots/reclaim", { headers: previewIdentity });
        if (!reclaim.ok()) break;
        const slot = await reclaim.json() as { slotId: number; nonce: string };
        const verified = await request.post(`/api/v1/previews/slots/${slot.slotId}/reset/verify`, {
          headers: previewIdentity,
          data: {
            nonce: slot.nonce,
            serviceWorkers: 0,
            cacheStorages: 0,
            localStorageKeys: 0,
            sessionStorageKeys: 0,
            indexedDatabases: 0,
            verifiable: true,
          },
        });
        expect(verified.ok(), `Fixture-Slot ${slot.slotId} muss sicher zurückgesetzt werden`).toBeTruthy();
      }
    };

    const stopFixtureRuntime = async () => {
      if (!projectId) return;
      const project = encodeURIComponent(projectId);
      await request.post(`/api/v1/previews/dev-servers/${project}/stop`, { headers: previewIdentity }).catch(() => {});
      await request.delete(`/api/v1/previews/sessions/by-key/preview-runtime:${project}`, { headers: previewIdentity }).catch(() => {});
      await reclaimFixtureSlots();
    };

    try {
      await writeFile(join(runtimeDirectory, "preview.config.json"), JSON.stringify({
        version: 2,
        mainService: "frontend",
        services: [{
          id: "frontend",
          name: "Preview-Messfixture",
          role: "frontend",
          command: "node server.mjs",
          port: "auto",
          portMode: "argument",
        }],
      }));
      await writeFile(join(runtimeDirectory, "server.mjs"), `import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1] ?? 1234);
createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><html lang=\\"de\\"><head><meta charset=\\"utf-8\\"><title>Preview-Messfixture</title></head><body><main>${spaText}</main></body></html>");
}).listen(port, "127.0.0.1");
`);

      const registered = await request.post("/api/v1/projects/register", {
        headers: previewIdentity,
        data: { path: runtimeDirectory },
      });
      expect(registered.ok()).toBeTruthy();
      const project = await registered.json() as { project: { id: string; name: string } };
      projectId = project.project.id;

      const profileResponse = await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}/profile`, {
        headers: previewIdentity,
      });
      expect(profileResponse.ok()).toBeTruthy();
      const profile = await profileResponse.json() as { services: Array<{ port: number | null }> };
      expect(profile.services.some((service) => service.port !== null)).toBeTruthy();

      await page.goto("/wrapt/previews");
      await page.getByRole("button", { name: "Preview-Projekt hinzufügen" }).click();
      const dialog = page.getByRole("dialog", { name: "Preview-Projekte" });
      await dialog.getByRole("textbox", { name: "Preview-Projekte suchen" }).fill(project.project.name);
      await dialog.getByRole("button", { name: project.project.name }).click();

      const readyTimes: number[] = [];
      const firstRenderTimes: number[] = [];
      const samples: Array<{ repetition: number; readyMs: number; firstRenderedMs: number }> = [];
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const command = page.locator(".preview-hub-command");
        await expect(command.locator(".preview-hub-state.is-stopped")).toBeVisible({ timeout: 15_000 });
        await expect(command.getByRole("button", { name: "Alles starten" })).toBeEnabled();

        const startedAt = performance.now();
        await command.getByRole("button", { name: "Alles starten" }).click();
        await expect(command.locator(".preview-hub-state.is-running")).toBeVisible({ timeout: 30_000 });
        const readyMs = performance.now() - startedAt;
        readyTimes.push(readyMs);

        const popupPromise = page.waitForEvent("popup");
        await page.getByRole("button", { name: "Im neuen Tab öffnen" }).click();
        const preview = await popupPromise;
        await expect(preview).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000 });
        await expect(preview.getByText(spaText)).toBeVisible({ timeout: 15_000 });
        const firstRenderedMs = performance.now() - startedAt;
        firstRenderTimes.push(firstRenderedMs);
        samples.push({ repetition, readyMs: Math.round(readyMs * 10) / 10, firstRenderedMs: Math.round(firstRenderedMs * 10) / 10 });
        console.info(`[preview-start] repetition=${repetition}/${repetitions} readyMs=${readyMs.toFixed(1)} firstRenderedMs=${firstRenderedMs.toFixed(1)}`);
        await preview.close();

        if (repetition < repetitions) {
          await stopFixtureRuntime();
          await page.reload();
        }
      }

      const report = {
        measuredAt: new Date().toISOString(),
        operatingSystem: { platform: process.platform, release: release(), architecture: arch() },
        browserVersion: page.context().browser()?.version() ?? "unknown",
        viewport: page.viewportSize(),
        energyMode,
        repetitions,
        samples,
        ready: summarize(readyTimes),
        firstRendered: summarize(firstRenderTimes),
        fixture: "lokaler isolierter SPA-Server",
      };
      const reportPath = join(reportDirectory, "preview-start-performance.json");
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
      console.info(`[preview-start] report=${reportPath} ${JSON.stringify(report)}`);
      expect(readyTimes).toHaveLength(repetitions);
      expect(firstRenderTimes).toHaveLength(repetitions);
    } finally {
      await stopFixtureRuntime();
      await rm(runtimeDirectory, { recursive: true, force: true });
    }
  });
});
