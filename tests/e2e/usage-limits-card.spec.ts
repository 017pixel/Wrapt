import { expect, test } from "@playwright/test";
import { mockUsageData } from "./helpers/usage";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test.beforeEach(async ({ page }) => {
  await mockUsageData(page);
});

test("zeigt Limitfenster, Resetzeiten und Banked Resets in der Hover-Card", async ({ page }) => {
  await page.goto("/wrapt/");
  const trigger = page.locator(".status-limits");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("usage-limits-card")).toHaveCount(0);

  await trigger.hover();
  const card = page.getByTestId("usage-limits-card");
  await expect(card).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toHaveClass(/is-open/);

  // Beide Codex-Fenster des ersten Accounts mit Auslastung und Reset-Zeit.
  const codex = card.locator('.ulc-provider[data-tone="info"]');
  const first = codex.locator(".ulc-account").first();
  await expect(first.getByText("5 Stunden", { exact: true })).toBeVisible();
  await expect(first.getByText("7 Tage", { exact: true })).toBeVisible();
  // Die Karte zeigt das Übrige, nicht den Verbrauch: 89 % verbraucht heißt
  // 11 % frei. Genau diese Verwechslung war die ursprüngliche Verwirrung.
  await expect(first.getByText("11 %", { exact: false })).toBeVisible();
  await expect(first.locator(".ulc-window-pct em")).toHaveCount(2);
  await expect(first.getByText("89 %", { exact: false })).toHaveCount(0);
  await expect(first.getByText("51 %", { exact: false })).toBeVisible();
  await expect(first.locator(".ulc-window.is-bad")).toBeVisible();
  await expect(first.locator(".ulc-window-reset").first()).toHaveText(/^in \d+ (Std|Tagen|Min)$/);

  // Banked Resets erscheinen nur beim Provider, der sie liefert.
  await expect(first.getByText("2 Reset-Guthaben")).toBeVisible();
  await expect(first.getByText(/gültig bis/)).toBeVisible();

  // Der zweite Account behält alle seine Fenster, auch ohne 5-Stunden-Limit.
  const second = codex.locator(".ulc-account").nth(1);
  await expect(second.getByText(/2\. b\.becker@aisci\.de/)).toBeVisible();
  await expect(second.getByText("7 Tage", { exact: true })).toBeVisible();
  await expect(second.getByText("5 Stunden", { exact: true })).toHaveCount(0);
  await expect(second.getByText("Reset-Guthaben")).toHaveCount(0);

  // Ein deaktivierter Provider erscheint gar nicht erst in der Leiste und damit
  // auch nicht in der Card — die Card zeigt genau die sichtbaren Provider.
  await expect(card.locator(".ulc-provider", { hasText: "Claude Code" })).toHaveCount(0);
  await expect(page.locator(".status-limits")).not.toContainText("Claude");

  // Kein nasser Browser-Tooltip mehr neben der Card.
  await expect(trigger).not.toHaveAttribute("title", /./);

  await expect(card.getByRole("link", { name: /Alle Nutzungsdaten öffnen/ })).toBeVisible();
});

test("zeigt einen Provider ohne Daten als neutrale Zeile statt als Ampel", async ({ page }) => {
  await page.goto("/wrapt/");
  await page.locator(".status-limits").hover();
  const card = page.getByTestId("usage-limits-card");
  await expect(card).toBeVisible();

  // `partial` bekommt keinen Provider-Akzent — es ist eine Einschränkung,
  // keine Ampel — und trotzdem ein sichtbares 30-Tage-Fenster.
  const opencode = card.locator('.ulc-provider[data-tone="neutral"]', { hasText: "OpenCode" });
  await expect(opencode.getByText("30 Tage", { exact: true })).toBeVisible();
  await expect(opencode.getByText("52 %", { exact: false })).toBeVisible();
  await expect(opencode.getByText("Teilweise Daten")).toBeVisible();

  // Der neutrale Punkt muss dem Farbton des Themes entsprechen und darf nicht
  // die Akzentfarbe des Providers tragen. Gegen die aufgelöste Variable prüfen,
  // nicht gegen einen festen Hexwert: `themeRuntime` überschreibt die Tokens zur
  // Laufzeit aus dem aktiven Theme.
  const tones = await card.evaluate((element) => {
    const read = (selector: string) => getComputedStyle(element.querySelector(selector)!).backgroundColor;
    // Ein Hilfselement mit dem Token als Hintergrund: getComputedStyle löst es in
    // dieselbe rgb()-Schreibweise auf wie die Dot-Flächen, sodass der Vergleich
    // nicht an Hex gegen rgb oder rem gegen px scheitert.
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--color-faint)";
    document.body.appendChild(probe);
    const faint = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { neutral: read('.ulc-provider[data-tone="neutral"] .ulc-dot'), accent: read('.ulc-provider[data-tone="info"] .ulc-dot'), faint };
  });
  expect(tones.neutral).not.toBe(tones.accent);
  expect(tones.neutral).toBe(tones.faint);
  await expect(opencode.getByText("Reset-Guthaben")).toHaveCount(0);
});

test("schließt die Hover-Card wieder beim Verlassen", async ({ page }) => {
  await page.goto("/wrapt/");
  const trigger = page.locator(".status-limits");
  await trigger.hover();
  await expect(page.getByTestId("usage-limits-card")).toBeVisible();

  // Weit weg vom Trigger bewegen, damit die Schließverzögerung greift.
  await page.mouse.move(10, 10);
  await expect(page.getByTestId("usage-limits-card")).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("nutzt die Theme-Tokens statt eigener Farben", async ({ page }) => {
  await page.goto("/wrapt/");
  await page.locator(".status-limits").hover();
  const card = page.getByTestId("usage-limits-card");
  await expect(card).toBeVisible();

  const styles = await card.evaluate((element) => {
    const computed = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--color-ink-850)";
    document.body.appendChild(probe);
    const overlay = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const arrow = element.querySelector(".ulc-arrow");
    return {
      background: computed.backgroundColor,
      overlay,
      border: computed.borderTopColor,
      borderWidth: computed.borderTopWidth,
      borderRadius: computed.borderTopLeftRadius,
      arrowBorder: getComputedStyle(arrow).borderRightColor,
      headDivider: getComputedStyle(element.querySelector(".ulc-head")).borderBottomColor,
      barTrack: getComputedStyle(element.querySelector(".ulc-bar")).backgroundColor,
    };
  });
  // Die Card-Fläche ist die Overlay-Ebene des Themes und der Radius dessen
  // Standard — keine eigene Farbe und keine eigene Rundung.
  expect(styles.background).toBe(styles.overlay);
  expect(styles.borderRadius).toBe("4px");

  // Kante, Trennlinien und Balkenspur müssen sich vom Untergrund abheben. Im
  // ausgelieferten Theme sind `--color-line`, `--color-ink-600` und
  // `--color-ink-850` alle `#191919` — eine Kante aus einer dieser Stufen wäre
  // unsichtbar, der Rahmen aber vorhanden. Deshalb wird hier ausdrücklich auf
  // den Unterschied geprüft und nicht nur auf das Vorhandensein.
  expect(styles.borderWidth).toBe("1px");
  expect(styles.border).not.toBe(styles.background);
  expect(styles.arrowBorder).not.toBe(styles.background);
  expect(styles.headDivider).not.toBe(styles.background);
  expect(styles.barTrack).not.toBe(styles.background);
});

test("öffnet per Klick die Karte, ohne sofort zur Nutzungsseite zu navigieren", async ({ page }) => {
  await page.goto("/wrapt/");
  const trigger = page.locator(".status-limits");
  await expect(trigger).toBeVisible();

  // Ein Klick muss immer die Karte öffnen und die Link-Navigation verhindern.
  // Ohne `preventDefault()` im Öffnungszweig gewinnt der Router, und auf Touch
  // wäre die Karte unerreichbar.
  await trigger.click();
  await expect(page.getByTestId("usage-limits-card")).toBeVisible();
  expect(new URL(page.url()).pathname).not.toContain("/usage");

  // Der zweite Klick schließt wieder und navigiert ebenfalls nicht.
  await trigger.click();
  await expect(page.getByTestId("usage-limits-card")).toHaveCount(0);
  expect(new URL(page.url()).pathname).not.toContain("/usage");

  // Die vollständige Auswertung bleibt der Fußlink in der Karte.
  await trigger.click();
  await page.getByTestId("usage-limits-card").getByRole("link", { name: /Alle Nutzungsdaten öffnen/ }).click();
  await expect(page).toHaveURL(/\/usage/);
});

test("wartet mit dem Öffnen und hält beim Schließen kurz stand", async ({ page }) => {
  await page.goto("/wrapt/");
  const trigger = page.locator(".status-limits");
  const card = page.getByTestId("usage-limits-card");

  // Kurz vor Ablauf der 700 ms darf die Karte noch nicht da sein — sonst
  // wäre jeder Verzögerungswert gleichwertig und der Test nutzlos.
  await trigger.hover();
  await page.waitForTimeout(350);
  await expect(card).toHaveCount(0);

  await expect(card).toBeVisible();

  // Nach dem Verlassen bleibt sie kurz stehen, damit der Zeiger in die Karte
  // wandern kann; 100 ms sind zu wenig für den Übergang.
  await page.mouse.move(10, 10);
  await page.waitForTimeout(100);
  await expect(card).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("begrenzt die Kartenhöhe auf den Raum über dem Trigger", async ({ page }) => {
  // Flaches Fenster: Ohne Begrenzung wächst die Karte über den oberen Rand
  // hinaus und Kopf wie erste Zeilen wären unerreichbar.
  await page.setViewportSize({ width: 1280, height: 320 });
  await page.goto("/wrapt/");
  await page.locator(".status-limits").hover();
  const card = page.getByTestId("usage-limits-card");
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
});

test("lässt den Pfeil sichtbar aus der Karte ragen", async ({ page }) => {
  await page.goto("/wrapt/");
  await page.locator(".status-limits").hover();
  const card = page.getByTestId("usage-limits-card");
  await expect(card).toBeVisible();

  // Ein `overflow` am Kartenrahmen würde den Pfeil abschneiden. Deshalb wird
  // nicht nur seine Farbe geprüft, sondern ob er echte Geometrie außerhalb
  // der Kartenbox besitzt.
  const geometry = await card.evaluate((element) => {
    const arrow = element.querySelector(".ulc-arrow")!;
    const cardRect = element.getBoundingClientRect();
    const arrowRect = arrow.getBoundingClientRect();
    return {
      overflow: getComputedStyle(element).overflow,
      ragtHeraus: arrowRect.bottom > cardRect.bottom,
      sichtbarHoehe: arrowRect.bottom - cardRect.bottom,
    };
  });
  expect(geometry.overflow).toBe("visible");
  expect(geometry.ragtHeraus).toBe(true);
  expect(geometry.sichtbarHoehe).toBeGreaterThan(0);
});

