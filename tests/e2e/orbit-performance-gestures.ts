import { expect, type BrowserContext, type Page } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { summarize, summarizeLongTasks } from "./orbit-performance-support";

type FrameResult = {
  frames: number[];
  tasks: number[] | null;
  longTaskObserverSupported: boolean;
};

export async function installFrameInstrumentation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const entryTypes = "PerformanceObserver" in window ? PerformanceObserver.supportedEntryTypes ?? [] : [];
    let observerSupported = entryTypes.includes("longtask");
    const state = { active: false, frames: [] as number[], tasks: [] as number[] | null, last: 0, generation: 0 };
    const frame = (time: number, generation: number) => {
      if (!state.active || generation !== state.generation) return;
      if (state.last > 0) state.frames.push(time - state.last);
      state.last = time;
      requestAnimationFrame((nextTime) => frame(nextTime, generation));
    };
    if (observerSupported) {
      try {
        new PerformanceObserver((list) => {
          if (state.active && state.tasks) state.tasks.push(...list.getEntries().map((entry) => entry.duration));
        }).observe({ type: "longtask", buffered: false });
      } catch { observerSupported = false; }
    }
    Object.defineProperty(window, "__orbitPerf", {
      configurable: false,
      value: {
        start: () => {
          state.frames = [];
          state.tasks = observerSupported ? [] : null;
          state.last = performance.now();
          state.active = true;
          state.generation += 1;
          const generation = state.generation;
          requestAnimationFrame((time) => frame(time, generation));
          return document.visibilityState;
        },
        stop: () => {
          state.active = false;
          state.generation += 1;
          return { frames: state.frames, tasks: state.tasks, longTaskObserverSupported: observerSupported };
        },
        capabilities: () => ({ longTaskObserverSupported: observerSupported }),
      },
    });
  });
}

async function measureGesture(page: Page, name: string, action: () => Promise<void>) {
  console.info(`[Orbit-Performance] Geste ${name}: startet.`);
  const documentVisible = await page.evaluate((label) =>
    (window as typeof window & { __orbitPerf: { start: (value: string) => string } }).__orbitPerf.start(label), name);
  const started = performance.now();
  let data: FrameResult;
  try {
    await action();
  } finally {
    data = await page.evaluate(() => (window as typeof window & { __orbitPerf: { stop: () => FrameResult } }).__orbitPerf.stop());
  }
  const durationMs = Number((performance.now() - started).toFixed(2));
  const frameTimeMs = data!.frames.reduce((total, interval) => total + interval, 0);
  const frameCoveragePercent = Number(Math.min(100, frameTimeMs / durationMs * 100).toFixed(2));
  if (documentVisible !== "visible" || frameCoveragePercent < 90) {
    throw new Error(`Orbit-Geste ${name} ist nicht auswertbar: sichtbar=${documentVisible === "visible"}, RAF-Abdeckung=${frameCoveragePercent} % (erforderlich: mindestens 90 %).`);
  }
  console.info(`[Orbit-Performance] Geste ${name}: beendet (${durationMs} ms, ${frameCoveragePercent} % RAF).`);
  return {
    name,
    durationMs,
    frameCoveragePercent,
    documentVisible: documentVisible === "visible",
    frames: summarize(data!.frames),
    frameIntervalsMs: data!.frames.map((value) => Number(value.toFixed(2))),
    longTasks: summarizeLongTasks(data!.tasks),
    longTaskObserverSupported: data!.longTaskObserverSupported,
    longTaskDurationsMs: data!.tasks?.map((value) => Number(value.toFixed(2))) ?? null,
  };
}

async function findEmptyCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.locator(".react-flow").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 80; y < bounds.bottom - 50; y += 23) {
      for (let x = bounds.left + 50; x < bounds.right - 40; x += 29) {
        const target = document.elementFromPoint(x, y);
        if (target?.closest(".react-flow__pane") && !target.closest(".react-flow__node-orbit")) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error("Die Orbit-Fixture lässt keine reproduzierbare freie Canvas-Messfläche frei.");
  return point;
}

async function repeatFor(durationMs: number, step: (index: number) => Promise<void>): Promise<void> {
  const endAt = Date.now() + durationMs;
  let index = 0;
  while (Date.now() < endAt) {
    await step(index++);
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
}

async function prepareNote(page: Page, primaryNoteId: string) {
  console.info(`[Orbit-Performance] Notiz ${primaryNoteId}: Fokusaktion startet.`);
  const note = page.locator(`.react-flow__node-orbit[data-id="${primaryNoteId}"]`);
  await note.getByRole("button", { name: "Fenster zentrieren" }).click({ timeout: 15_000 });
  console.info(`[Orbit-Performance] Notiz ${primaryNoteId}: Fokusaktion abgeschlossen.`);
  await expect(note).toBeInViewport({ timeout: 15_000 });
  console.info(`[Orbit-Performance] Notiz ${primaryNoteId}: im Viewport.`);
  await note.locator(".orbit-node-header").click({ timeout: 15_000 });
  console.info(`[Orbit-Performance] Notiz ${primaryNoteId}: Kopfzeile angeklickt.`);
  return note;
}

export type GestureSample = Awaited<ReturnType<typeof measureGesture>>;

export async function measureCanvasGestures(
  page: Page,
  context: BrowserContext,
  durationMs: number,
  primaryNoteId: string,
): Promise<GestureSample[]> {
  const cdp = await context.newCDPSession(page);
  const gestures: GestureSample[] = [];
  try {
    let point = await findEmptyCanvasPoint(page);
    gestures.push(await measureGesture(page, "pan", async () => {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      try {
        await repeatFor(durationMs, async (step) => page.mouse.move(point.x + (step % 2 ? 26 : -26), point.y + (step % 3 ? 17 : -17)));
      } finally { await page.mouse.up(); }
    }));

    point = await findEmptyCanvasPoint(page);
    gestures.push(await measureGesture(page, "zoom-wheel", async () => {
      await page.mouse.move(point.x, point.y);
      await repeatFor(durationMs, async (step) => page.mouse.wheel(0, step % 2 ? 55 : -55));
    }));

    point = await findEmptyCanvasPoint(page);
    gestures.push(await measureGesture(page, "zoom-pinch", async () => {
      await repeatFor(durationMs, (step) => cdp.send("Input.synthesizePinchGesture", {
        x: point.x, y: point.y, scaleFactor: step % 2 ? 1.035 : 0.965, relativeSpeed: 800,
      }));
    }));

    console.info("[Orbit-Performance] Drag-Vorbereitung startet.");
    const noteForDrag = await prepareNote(page, primaryNoteId);
    const header = await noteForDrag.locator(".orbit-node-header").boundingBox();
    if (!header) throw new Error("Der feste Notiz-Knoten ist für die Drag-Messung nicht sichtbar.");
    gestures.push(await measureGesture(page, "drag", async () => {
      await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
      await page.mouse.down();
      try {
        await repeatFor(durationMs, async (step) => page.mouse.move(header.x + header.width / 2 + (step % 2 ? 22 : -22), header.y + header.height / 2 + (step % 3 ? 12 : -12)));
      } finally { await page.mouse.up(); }
    }));

    console.info("[Orbit-Performance] Resize-Vorbereitung startet.");
    const noteForResize = await prepareNote(page, primaryNoteId);
    const corner = noteForResize.locator(".orbit-resize-corner.bottom.right");
    await expect(corner).toBeVisible();
    const resize = await corner.boundingBox();
    if (!resize) throw new Error("Der feste Notiz-Knoten ist für die Resize-Messung nicht sichtbar.");
    gestures.push(await measureGesture(page, "resize", async () => {
      await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
      await page.mouse.down();
      try {
        await repeatFor(durationMs, async (step) => page.mouse.move(resize.x + resize.width / 2 + (step % 2 ? 18 : -18), resize.y + resize.height / 2 + (step % 3 ? 16 : -16)));
      } finally { await page.mouse.up(); }
    }));
  } finally {
    await cdp.detach();
  }
  return gestures;
}
