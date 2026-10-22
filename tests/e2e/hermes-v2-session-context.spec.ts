import { expect } from "@playwright/test";
import { resourceTest as test, prepareResources, sessionId } from "./hermes-v2-resource-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });
test.beforeEach(({ gateway }) => prepareResources(gateway));

for (const variant of ["route", "standalone"] as const) {
  for (const width of [390, 1440]) {
    test(`${variant} zeigt bei ${width}px den tatsächlich gemeldeten Sitzungskontext`, async ({ page, gateway }) => {
      await page.setViewportSize({ width, height: width === 390 ? 500 : 900 });
      const session = gateway.stories.get(sessionId)!.snapshot.session;
      session.cwd = "/eigene/projekte/kontext-eins";
      session.projectId = "eigenes-kontextprojekt";
      session.source = "cli";
      const path = variant === "standalone" ? "/wrapt/hermes-v2/standalone" : "/wrapt/hermes-v2";
      await page.goto(`${path}?session=${sessionId}`);
      await expect(page.getByRole("textbox", { name: "Nachricht an Hermes", exact: true })).toBeEnabled();
      await expect(page.getByRole("dialog", { name: "Hermes-V2-Sitzungen", exact: true })).toHaveCount(0);
      await page.getByText("Sitzungsdetails", { exact: true }).click();
      const context = page.getByRole("region", { name: "Sitzungskontext", exact: true });
      for (const value of [session.cwd, session.projectId, session.source]) {
        await expect(context.getByText(value, { exact: true })).toBeVisible();
      }
      expect(gateway.calls.filter((call) => ["session.create", "message.submit", "session.stop"].includes(call.op))).toHaveLength(0);
    });
  }
}

test("ersetzt den Kontext beim Wechsel und behält keine Werte bei leerer Auswahl", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  const first = gateway.stories.get(sessionId)!.snapshot.session;
  first.cwd = "/eigene/projekte/erster-kontext";
  first.source = "cli";
  const second = gateway.seed("context-second-own", "Eigene zweite Kontextprüfung");
  gateway.composer.seed(second.session.id);
  second.session.cwd = "/eigene/projekte/zweiter-kontext";
  second.session.source = "web";
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  await page.getByText("Sitzungsdetails", { exact: true }).click();
  await expect(page.getByText(first.cwd, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sitzungen", exact: true }).click();
  await page.locator(`[data-session-id="${second.session.id}"] .hermesv2-rowselect`).click();
  await page.getByText("Sitzungsdetails", { exact: true }).click();
  await expect(page.getByText(second.session.cwd, { exact: true })).toBeVisible();
  await expect(page.getByText("web", { exact: true })).toBeVisible();
  await expect(page.getByText(first.cwd, { exact: true })).toHaveCount(0);
  await page.goto("/wrapt/hermes-v2/standalone");
  await expect(page.getByRole("heading", { name: "Womit fangen wir an?" })).toBeVisible();
  await expect(page.getByText(first.cwd, { exact: true })).toHaveCount(0);
  await expect(page.getByText(second.session.cwd, { exact: true })).toHaveCount(0);
});
