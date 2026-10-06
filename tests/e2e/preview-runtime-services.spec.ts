import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { previewIdentity, previewsEnabled, previewsReason } from "./helpers/previews";

/**
 * Regression: Der Status einer mehrteiligen Projektlaufzeit muss Dienste aus
 * allen tmux-Fenstern melden. Vor dem Fix listete `list-panes` nur das aktuelle
 * Fenster, dadurch galt jeder weitere Dienst als „Gestoppt" und der Watchdog
 * überwachte ihn nicht.
 */
test.describe("Projektlaufzeit mit mehreren Diensten", () => {
  test.skip(!previewsEnabled, previewsReason);

  test("meldet den zweiten Dienst im zweiten Fenster als laufend", async ({ page, request }) => {
    test.setTimeout(120_000);
    const runtimeDirectory = await mkdtemp(join(process.cwd(), "tests", "fixtures", ".e2e-multi-"));
    await writeFile(join(runtimeDirectory, "preview.config.json"), JSON.stringify({
      version: 2,
      mainService: "frontend",
      services: [
        {
          id: "frontend",
          name: "E2E Frontend",
          role: "frontend",
          command: "node frontend.mjs",
          port: "auto",
          portMode: "argument",
        },
        {
          id: "worker",
          name: "E2E Worker",
          role: "worker",
          command: "node worker.mjs",
          port: null,
          portMode: "none",
        },
      ],
    }));
    await writeFile(join(runtimeDirectory, "frontend.mjs"), `import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1] ?? 0);
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><html lang=\\"de\\"><body><p>Mehrdienst bereit</p></body></html>");
});
server.listen(port, "127.0.0.1", () => console.log("frontend bereit"));
`);
    await writeFile(join(runtimeDirectory, "worker.mjs"), `console.log("worker bereit");
setInterval(() => {}, 1_000);
`);

    const registered = await request.post("/api/v1/projects/register", {
      headers: previewIdentity,
      data: { path: runtimeDirectory },
    });
    expect(registered.ok()).toBeTruthy();
    const project = (await registered.json() as { project: { id: string; name: string } }).project;
    const projectId = project.id;

    try {
      await test.step("Laufzeit über die API starten", async () => {
        const started = await request.post(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}/start`, { headers: previewIdentity });
        expect(started.ok()).toBeTruthy();
      });

      await test.step("Beide Dienste melden running", async () => {
        await expect.poll(async () => {
          const response = await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}`, { headers: previewIdentity });
          if (!response.ok()) return null;
          const status = await response.json() as { services: Array<{ id: string; state: string; port: number | null }> };
          return status.services.map((service) => `${service.id}:${service.state}`).sort().join(",");
        }, { timeout: 20_000, intervals: [500, 1_000, 2_000] }).toBe("frontend:running,worker:running");

        const response = await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}`, { headers: previewIdentity });
        const status = await response.json() as { state: string; services: Array<{ id: string; state: string }> };
        expect(status.state).toBe("running");
      });

      await test.step("Hub zeigt beide Dienste als laufend", async () => {
        await page.goto("/wrapt/previews");
        await page.getByRole("button", { name: "Preview-Projekt hinzufügen" }).click();
        const dialog = page.getByRole("dialog", { name: "Preview-Projekte" });
        await dialog.getByRole("textbox", { name: "Preview-Projekte suchen" }).fill(project.name);
        await dialog.getByRole("button", { name: new RegExp(project.name) }).click();
        await expect(page.locator(".preview-hub-service", { hasText: "E2E Frontend" })).toHaveCount(1);
        await expect(page.locator(".preview-hub-service", { hasText: "E2E Worker" })).toHaveCount(1);
        await expect(page.locator(".preview-hub-service[data-state=running]")).toHaveCount(2, { timeout: 15_000 });
        await expect(page.locator(".preview-hub-command .preview-hub-state.is-running")).toHaveAccessibleName("Läuft");
        await expect(page.locator(".preview-hub-service .preview-hub-state.is-running")).toHaveCount(0);
      });

      // Hinweis: Das Schließen während eines noch laufenden Launchs deckt der
      // Unit-Test „eine Freigabe während des Laufzeitstarts verhindert die
      // verspätete Veröffentlichung“ ab — Netzwerkgatter (`page.route`) greifen
      // in WebKit für späte Anfragen nicht. Hier läuft der Launch zuerst durch
      // (gleiche Warteschlange serialisiert Öffnen und Schließen deterministisch),
      // danach muss der Tab sauber schließen ohne verwaiste Slots.
      await test.step("Tab schließen gibt den Slot frei und erhält die laufenden Dienste", async () => {
        const status = await (await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}`, { headers: previewIdentity })).json();
        const port = status.mainPort;
        await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
        await page.getByRole("button", { name: "Preview-URL kopieren", exact: true }).click();
        await expect.poll(async () => {
          const current = await (await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}`, { headers: previewIdentity })).json();
          return current.publicUrl;
        }, { timeout: 30_000 }).not.toBeNull();
        await page.getByRole("button", { name: `${project.name} schließen, Laufzeit bleibt aktiv`, exact: true }).click();
        await expect(page.getByRole("tab", { name: project.name, exact: true })).toHaveCount(0);
        await expect.poll(async () => {
          const current = await (await request.get(`/api/v1/previews/slots`, { headers: previewIdentity })).json();
          return current.slots.filter((slot: { targetPort: number | null }) => slot.targetPort === port).length;
        }).toBe(0);
        const runtime = await (await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}`, { headers: previewIdentity })).json();
        expect(runtime.publicUrl).toBeNull();
        expect(runtime.services.every((service: { state: string }) => service.state === "running")).toBe(true);
        expect((await request.get(`http://127.0.0.1:${port}/`)).ok()).toBe(true);
      });
    } finally {
      await request.post(`/api/v1/previews/dev-servers/${encodeURIComponent(projectId)}/stop`, { headers: previewIdentity }).catch(() => {});
      await request.delete(`/api/v1/previews/sessions/by-key/preview-runtime:${encodeURIComponent(projectId)}`, { headers: previewIdentity }).catch(() => {});
      await rm(runtimeDirectory, { recursive: true, force: true });
    }
  });
});
