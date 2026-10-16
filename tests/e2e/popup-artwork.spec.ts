import { expect, test } from "@playwright/test";
import { mockUsageData } from "./helpers/usage";

test.use({ serviceWorkers: "block", extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("Popup-Bilder behalten vom ersten Frame an dieselbe Helligkeit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockUsageData(page);
  await page.goto("/wrapt/projects");
  for (const [trigger, selector, opacity] of [
    [".status-version", ".chc-artwork", "0.38"],
    [".status-limits", ".ulc-artwork", "0.32"],
  ]) {
    for (let opening = 0; opening < 2; opening++) {
      // Beobachter vor dem Öffnen: auch der erste eingehängte Zustand zählt.
      await page.evaluate((imageSelector) => {
        const frames: { opacity: string; transition: string; complete: boolean }[] = [];
        Object.assign(window, { popupFrames: frames });
        const sample = () => {
          const img = document.querySelector<HTMLImageElement>(imageSelector);
          if (!img) return;
          frames.push({ opacity: getComputedStyle(img).opacity, transition: getComputedStyle(img).transitionDuration, complete: img.complete && img.naturalWidth > 0 });
          if (frames.length < 20) requestAnimationFrame(sample);
        };
        const observer = new MutationObserver(() => {
          if (!document.querySelector(imageSelector)) return;
          observer.disconnect();
          sample();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }, selector!);
      await page.locator(trigger!).hover();
      await expect(page.locator(selector!)).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as unknown as { popupFrames: unknown[] }).popupFrames.length)).toBe(20);
      const frames = await page.evaluate(() => (window as unknown as { popupFrames: { opacity: string; transition: string; complete: boolean }[] }).popupFrames);
      expect(frames.every((frame) => frame.opacity === opacity && frame.transition === "0s" && frame.complete)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(selector!)).toHaveCount(0);
      await page.mouse.move(600, 300);
    }
  }
  expect(errors).toEqual([]);
});

test("Sterne funkeln nur bei erlaubter Bewegung; Bildfehler lassen Inhalt bedienbar", async ({ page }) => {
  await page.goto("/wrapt/projects");
  await page.locator(".status-version").click();
  const star = page.locator(".chc-stars circle").first();
  await expect(star).toHaveCSS("animation-name", "chc-twinkle");
  await expect(page.locator(".chc-stars")).toHaveAttribute("aria-hidden", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(star).toHaveCSS("animation-name", "none");
  await page.locator(".chc-artwork").dispatchEvent("error");
  await expect(page.locator(".chc-artwork")).toBeHidden();
  await expect(page.locator(".chc-stars")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Changelog", exact: true })).toBeVisible();
  await expect(page.locator(".chc-entry").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".status-version")).toBeFocused();
});

test("Verzögerte und fehlgeschlagene Bildantworten blockieren das Popup nicht", async ({ page }) => {
  let releaseImage!: () => void;
  const delayedImage = new Promise<void>((resolve) => { releaseImage = resolve; });
  await page.route("**/*changelog-night-sky-surface*", async (route) => {
    await delayedImage;
    await route.continue();
  });
  await page.goto("/wrapt/projects");
  await page.locator(".status-version").click();
  const image = page.locator(".chc-artwork");
  await expect(page.getByRole("heading", { name: "Changelog", exact: true })).toBeVisible();
  expect(await image.evaluate((element) => (element as HTMLImageElement).complete)).toBe(false);
  await expect(image).toHaveCSS("opacity", "0.38");
  await expect(image).toHaveCSS("transition-duration", "0s");
  releaseImage();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(image).toHaveCSS("opacity", "0.38");
  await expect(image).toHaveCSS("transition-duration", "0s");

  await page.unroute("**/*changelog-night-sky-surface*");
  await page.route("**/*changelog-night-sky-surface*", (route) => route.abort());
  await page.reload();
  await page.locator(".status-version").click();
  await expect(image).toBeHidden();
  await expect(page.locator(".chc-stars")).toBeHidden();
  await expect(page.locator(".chc-entry").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".status-version")).toBeFocused();
});

test("Server-Bildakzent bleibt auf Desktop und Handy innerhalb des Dialogs", async ({ page, baseURL }) => {
  await page.addInitScript((origin) => {
    localStorage.setItem("wrapt.workspaces.v1", JSON.stringify({ version: 1, workspaces: [
      { id: "popup-main", name: "Testserver", url: origin, addedAt: "2026-10-15T00:00:00.000Z", lastUsedAt: null, customName: true },
      { id: "popup-demo", name: "Demonstration", url: "https://demo.invalid", addedAt: "2026-10-15T00:00:00.000Z", lastUsedAt: null },
    ] }));
  }, new URL(baseURL!).origin);
  await page.route("**/api/v1/workspaces/probe", (route) => route.fulfill({ json: {
    status: "live", reachable: true, version: "2.8.0", instanceName: "Demonstration", appName: "Wrapt", bootId: "popup-demo",
  } }));
  for (const width of [1280, 320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/wrapt/projects");
    if (width < 768) await page.getByRole("button", { name: "Navigation öffnen" }).click();
    await page.getByRole("button", { name: /Aktueller Server:.*Server wechseln/ }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog", { name: "Server wechseln", exact: true });
    const image = dialog.locator(".workspace-switcher-artwork");
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const close = dialog.getByRole("button", { name: "Workspace-Auswahl schließen" });
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(dialog).toHaveCount(0);
  }
});
