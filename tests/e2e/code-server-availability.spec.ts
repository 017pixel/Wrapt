import { expect, test } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("zeigt bei fehlendem Code-Server eine nutzbare Werkzeugseite", async ({ page, request }) => {
  const origin = new URL(workbenchUrl).origin;
  const response = await request.get(`${origin}/api/v1/services`, {
    headers: { "tailscale-user-login": "user@example.com" },
  });
  await expect(response).toBeOK();
  const services = await response.json() as { services: Array<{ id: string; state: string }> };
  test.skip(services.services.some((service) => service.id === "code-server" && service.state === "active"),
    "Ein laufender Code-Server wird in der privaten Instanz geprüft.");

  await page.goto(`${workbenchUrl}/code-editor`);
  await expect(page.getByText(/Code-Server (läuft auf diesem Gerät nicht|ist derzeit nicht erreichbar|Status ist noch nicht verfügbar)/)).toBeVisible();
  await expect(page.locator('iframe[title="Editor"]')).toHaveCount(0);
});
