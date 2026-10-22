import { expect, type Page } from "@playwright/test";
import {
  resourceTest as test,
  prepareResources,
  openResources,
  selectCron,
  resourceRegion,
  resourceWrites,
} from "./hermes-v2-resource-fixture";

async function createForm(page: Page, name: string) {
  await page.getByRole("button", { name: "Neuen Cron-Job erstellen", exact: true }).click();
  const form = page.getByRole("dialog").last();
  await form.getByRole("textbox", { name: /Name/i }).fill(name);
  await form.getByRole("textbox", { name: /Prompt/i }).fill("Eigene synthetische Prüfanweisung");
  await form.getByRole("textbox", { name: /Zeitplan|Schedule/i }).fill("every 30m");
  await form.getByRole("combobox", { name: /Projekt/i }).selectOption("wrapt");
  await form.getByRole("checkbox", { name: /pausiert/i }).check();
  return form;
}

for (const width of [1440, 390]) {
  test.describe(`Ungeklärte Cron-Quittung bei ${width}px`, () => {
    test.use({
      extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
      viewport: { width, height: 900 },
    });
    test.beforeEach(({ gateway }) => prepareResources(gateway));

    test("bleibt nach drei neueren Quittungen bewusst abgleichbar und schreibt erst auf erneuten Klick", async ({ page, gateway }) => {
      await openResources(page);
      await selectCron(page);
      gateway.resources.failNextAction = "unknown";
      let form = await createForm(page, "Eigener unklar bestätigter Job");
      await form.getByRole("button", { name: /^Erstellen$/i }).click();
      await expect(form.getByRole("alert")).toContainText(/unklar/i);
      await form.getByRole("button", { name: /^Abbrechen$/i }).click();
      expect(resourceWrites(gateway)).toHaveLength(1);

      for (const action of ["fortsetzen", "pausieren", "fortsetzen"]) {
        const button = page.getByRole("button", {
          name: `Cron-Job ${action}: Eigener Prüfjob`, exact: true,
        });
        await expect(button).toBeEnabled();
        await button.click();
        const next = action === "fortsetzen" ? "pausieren" : "fortsetzen";
        await expect(page.getByRole("button", {
          name: `Cron-Job ${next}: Eigener Prüfjob`, exact: true,
        })).toBeEnabled();
      }
      expect(resourceWrites(gateway)).toHaveLength(4);
      const actions = resourceRegion(page, "cron").getByRole("list", { name: "Cron-Aktionen", exact: true });
      await expect(actions).toContainText("Erstellen: unbekannt");
      const reconcile = actions.getByRole("button", { name: "Bewusst neu lesen", exact: true });
      await expect(reconcile).toBeVisible();

      form = await createForm(page, "Eigener zweiter bewusster Job");
      await form.getByRole("button", { name: /^Erstellen$/i }).click();
      await expect(form.getByRole("alert")).toContainText(/bewusst neu lesen/i);
      expect(resourceWrites(gateway)).toHaveLength(4);
      await form.getByRole("button", { name: /^Abbrechen$/i }).click();

      const listReads = () => gateway.resources.calls.filter((call) => call.method === "GET" && call.path === "/cron/jobs").length;
      const before = listReads();
      await reconcile.click();
      await expect.poll(listReads).toBeGreaterThan(before);
      await expect(page.getByRole("button", { name: "Cron-Job: Eigener unklar bestätigter Job", exact: true })).toBeVisible();
      expect(resourceWrites(gateway)).toHaveLength(4);

      form = await createForm(page, "Eigener zweiter bewusster Job");
      await form.getByRole("button", { name: /^Erstellen$/i }).click();
      await expect(form).toHaveCount(0);
      await expect.poll(() => resourceWrites(gateway).length).toBe(5);
      expect([...gateway.resources.jobs.values()].filter((job) => job.name === "Eigener unklar bestätigter Job")).toHaveLength(1);
      expect([...gateway.resources.jobs.values()].filter((job) => job.name === "Eigener zweiter bewusster Job")).toHaveLength(1);
    });
  });
}
