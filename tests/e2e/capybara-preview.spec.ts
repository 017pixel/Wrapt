import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("spielt denselben Partytanz mit gleichen Effekten in Vorschau und Statusleiste", async ({ page, request }) => {
  await request.put("/api/v1/system/mascot", { data: { mascot: { enabled: true, scale: 1 } } });
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.clock.install();
  let releaseRestart: (() => void) | undefined;
  await page.route("**/api/v1/system/restart/status", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await new Promise<void>((resolve) => { releaseRestart = resolve; });
    // Nur die gelesene Antwort simulieren, keinen Dienst neu starten.
    await route.fulfill({ json: {
      ...body, phase: "succeeded", jobId: "571a71f1-c957-45e8-b226-0d7a07fdf246",
      updatedAt: new Date().toISOString(),
    } });
  });
  try {
    await page.goto("/wrapt/settings#einstellungen:easter-eggs");
    const preview = page.getByRole("button", { name: "Capybara testen" });
    const status = page.getByRole("button", { name: "Capybara begrüßen" });
    await expect(status).toBeVisible();
    await expect.poll(() => typeof releaseRestart).toBe("function");
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1_000)));
    await page.getByRole("button", { name: "Party", exact: true }).click();
    releaseRestart!();
    for (let attempt = 0; attempt < 5 && await status.getAttribute("data-frame") !== "party"; attempt++) {
      await page.clock.runFor(10);
    }
    await expect(status).toHaveAttribute("data-frame", "party");

    const pose = async (actor: typeof preview) => actor.evaluate((element) => {
      const sprite = element.querySelector<HTMLImageElement>(".capy-sprite")!;
      const motion = getComputedStyle(sprite);
      const confetti = element.querySelector(".capy-confetti");
      const effect = confetti ? getComputedStyle(confetti) : null;
      return {
        frame: element.getAttribute("data-frame"), action: element.getAttribute("data-action"),
        facing: element.getAttribute("data-facing"), source: sprite.currentSrc,
        width: sprite.width, height: sprite.height, animation: motion.animationName,
        duration: motion.animationDuration,
        confetti: effect ? { width: effect.width, height: effect.height, top: effect.top, right: effect.right } : null,
      };
    });
    const origin = await preview.evaluate((element) => getComputedStyle(element).getPropertyValue("--capy-offset"));
    // Stichproben aus sämtlichen Phasen, jeweils mit Abstand zur Frame-Grenze.
    for (const elapsed of [100, 500, 260, 330, 300, 500, 260, 330, 300, 520, 270]) {
      await page.clock.runFor(elapsed);
      expect(await pose(preview)).toEqual(await pose(status));
      if (await preview.getAttribute("data-frame") === "hopB") {
        expect(await preview.evaluate((element) => getComputedStyle(element).getPropertyValue("--capy-offset"))).not.toBe(origin);
      }
    }
    await expect(page.locator(".mascot-setting-message")).toHaveCount(0);
  } finally {
    releaseRestart?.();
    await request.put("/api/v1/system/mascot", { data: { mascot: { enabled: false, scale: 1 } } });
  }
});
