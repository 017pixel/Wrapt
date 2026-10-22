import { test } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";
import { resetTerminalTestWorkspace } from "./helpers/terminal";
import { verifyTerminalReentry, verifyTerminalScrollFlood, verifyTerminalWake } from "./helpers/terminal-native";

const login = process.env.WRAPT_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: apiIdentityHeaders(login) });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await resetTerminalTestWorkspace(page, login);
});

test("scrollt nach Sitzungswechsel, Werkzeugwechsel, Pane- und Website-Wiederöffnung ohne Reload", async ({ page }) => {
  await verifyTerminalReentry(page, `${workbenchUrl}/terminal`);
});

test("erholt einen nach Standby scheinbar offenen Socket und scrollt sofort", async ({ page }) => {
  await verifyTerminalWake(page, `${workbenchUrl}/terminal`);
});

test("bündelt schnelle TUI-Scrollfolgen ohne Eingabeverlust oder Socket-Abbruch", async ({ page }) => {
  await verifyTerminalScrollFlood(page, `${workbenchUrl}/terminal`);
});
