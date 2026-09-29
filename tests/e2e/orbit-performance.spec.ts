import { expect, test, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { startPreviewFixtures } from "../fixtures/preview-apps/server.mjs";
import { installPreviewLifecycleAudit, measurePreviewRouteMatrix, observePreviewSessions } from "./orbit-performance-preview";
import { installFrameInstrumentation, measureCanvasGestures, type GestureSample } from "./orbit-performance-gestures";
import { writeProgressSnapshot, writeReport } from "./orbit-performance-report";
import {
  assertFixturePortsFree,
  assertIsolatedHarness,
  createPerformanceWorkspace,
  hostMetadata,
  PERF_FIXTURE,
  PERF_HEADERS,
  PERF_SCENARIOS,
  summarize,
  summarizeLongTasks,
  type PerformanceScenario,
} from "./orbit-performance-support";

let stopFixtures: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  await assertIsolatedHarness();
  await assertFixturePortsFree();
  stopFixtures = await startPreviewFixtures();
});

test.afterAll(async () => {
  await stopFixtures?.();
  stopFixtures = null;
});

async function seedWorkspace(request: APIRequestContext, origin: string, scenario: PerformanceScenario): Promise<void> {
  const url = new URL("/api/v1/orbit", origin).toString();
  const currentResponse = await request.get(url, { headers: PERF_HEADERS });
  if (!currentResponse.ok()) throw new Error(`Isoliertes Orbit-Dokument konnte nicht gelesen werden (${currentResponse.status()}).`);
  const current = await currentResponse.json() as { revision: number };
  const saved = await request.put(url, {
    headers: PERF_HEADERS,
    data: { expectedRevision: current.revision, document: createPerformanceWorkspace(scenario) },
  });
  if (!saved.ok()) throw new Error(`Deterministische Orbit-Fixture konnte nicht gespeichert werden (${saved.status()}): ${await saved.text()}`);
}

async function captureStableFixture(
  page: Page,
  scenario: { name: string; nodes: number; edges: number; previews: number },
): Promise<{ activeNodes: number; activeEdges: number; activeIframes: number }> {
  const deadline = Date.now() + 10_000;
  let last = "keine DOM-Probe";
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async () => {
      let previous = "";
      let stableFrames = 0;
      let counts = { nodes: 0, edges: 0, iframes: 0, connectionsVisible: false };
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        counts = {
          nodes: document.querySelectorAll(".react-flow__node-orbit").length,
          edges: document.querySelectorAll(".react-flow__edge").length,
          iframes: document.querySelectorAll(".orbit-preview-slot .preview-slot-frame iframe").length,
          connectionsVisible: document.querySelector<HTMLButtonElement>('.orbit-main-island button[aria-label="Verbindungen umschalten"]')?.classList.contains("is-active") ?? false,
        };
        const current = JSON.stringify(counts);
        stableFrames = current === previous ? stableFrames + 1 : 1;
        previous = current;
        if (stableFrames >= 3) return counts;
      }
      return counts;
    });
    last = JSON.stringify(snapshot);
    if (snapshot.nodes === scenario.nodes && snapshot.edges === scenario.edges
      && snapshot.iframes === scenario.previews && snapshot.connectionsVisible) {
      return { activeNodes: snapshot.nodes, activeEdges: snapshot.edges, activeIframes: snapshot.iframes };
    }
    await page.waitForTimeout(40);
  }
  throw new Error(`Orbit-Fixture „${scenario.name}“ wurde nicht 3 RAF-Frames stabil (${last}).`);
}

async function measureRoutes(page: Page) {
  const orbitLink = page.locator('a[data-navigation-id="wrapt.orbit.navigation.main"]');
  const notesLink = page.locator('a[data-navigation-id="wrapt.notes.navigation.main"]');
  await page.evaluate(() => {
    const routePerf = {
      pending: null as { to: string; startedAt: number } | null,
      samples: [] as Array<{ to: string; durationMs: number }>,
    };
    Object.defineProperty(window, "__orbitRoutePerf", { configurable: false, value: routePerf });
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>(
        'a[data-navigation-id="wrapt.notes.navigation.main"], a[data-navigation-id="wrapt.orbit.navigation.main"]',
      );
      if (!link) return;
      routePerf.pending = { to: new URL(link.href).pathname, startedAt: performance.now() };
    }, true);
    new MutationObserver(() => {
      const pending = routePerf.pending;
      if (!pending || window.location.pathname !== pending.to
        || !document.querySelector(".persistent-route.is-active")) return;
      routePerf.pending = null;
      requestAnimationFrame(() => routePerf.samples.push({
        to: pending.to,
        durationMs: Number((performance.now() - pending.startedAt).toFixed(2)),
      }));
    }).observe(document.body, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
  });
  const currentMetricCount = () => page.evaluate(() =>
    (window as typeof window & { __orbitRoutePerf: { samples: unknown[] } }).__orbitRoutePerf.samples.length);
  const readLastRouteMetric = async (expectedCount: number) => {
    await expect.poll(currentMetricCount).toBe(expectedCount);
    return page.evaluate(() =>
      (window as typeof window & { __orbitRoutePerf: { samples: Array<{ to: string; durationMs: number }> } })
        .__orbitRoutePerf.samples.at(-1)!);
  };
  const toNotes = async () => {
    const expectedCount = await currentMetricCount() + 1;
    await notesLink.click();
    const activeNotesWorkspace = page.locator(".persistent-route.is-active .notes-workspace");
    await expect(activeNotesWorkspace).toBeVisible();
    await expect(activeNotesWorkspace.locator(".notes-main")).toBeVisible();
    return readLastRouteMetric(expectedCount);
  };
  const toOrbit = async () => {
    const expectedCount = await currentMetricCount() + 1;
    await orbitLink.click();
    await expect(page.locator(".orbit-page")).toBeVisible();
    await expect(page.locator(".orbit-board-picker-trigger")).toBeEnabled();
    return readLastRouteMetric(expectedCount);
  };

  await toNotes();
  await toOrbit();
  const samples: Array<{ to: string; durationMs: number }> = [];
  for (let index = 0; index < 10; index += 1) samples.push(index % 2 === 0 ? await toNotes() : await toOrbit());
  return { warmupTransitions: 2, samples };
}

type CanvasScenarioRun = {
  gestures: GestureSample[];
  longTaskObserverSupported: boolean;
  activeNodes: number;
  activeEdges: number;
  activeIframes: number;
};

async function measureSmallScenario(
  browser: Browser,
  request: APIRequestContext,
  origin: string,
  contextOptions: BrowserContextOptions,
): Promise<CanvasScenarioRun & { browserMetadata: Record<string, unknown> }> {
  await seedWorkspace(request, origin, "small");
  const context = await browser.newContext(contextOptions);
  try {
    await installFrameInstrumentation(context);
    const page = await context.newPage();
    await page.goto(`${origin}/wrapt/orbit`);
    await page.bringToFront();
    await expect(page.locator(".orbit-page")).toBeVisible();
    await expect(page.locator(".orbit-board-picker-trigger")).toBeEnabled();
    const { activeNodes, activeEdges, activeIframes } = await captureStableFixture(page, PERF_SCENARIOS.small);
    const gestures = await measureCanvasGestures(page, context, PERF_FIXTURE.gestureDurationMs, PERF_FIXTURE.primaryNoteId);
    await captureStableFixture(page, PERF_SCENARIOS.small);
    return {
      gestures,
      longTaskObserverSupported: gestures.every((gesture) => gesture.longTaskObserverSupported),
      activeNodes,
      activeEdges,
      activeIframes,
      browserMetadata: await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        viewport: { width: innerWidth, height: innerHeight },
        deviceScaleFactor: devicePixelRatio,
      })),
    };
  } finally {
    await context.close();
  }
}

type StressScenarioRun = CanvasScenarioRun & {
  routes: { warmupTransitions: number; samples: Array<{ to: string; durationMs: number }> };
  previewTransitions: Awaited<ReturnType<typeof measurePreviewRouteMatrix>>;
  coldOpenDurationMs: number;
  previewReadyDurationMs: number;
};

async function measureStressScenario(
  browser: Browser,
  request: APIRequestContext,
  origin: string,
  contextOptions: BrowserContextOptions,
): Promise<StressScenarioRun> {
  await seedWorkspace(request, origin, "stress");
  const context = await browser.newContext(contextOptions);
  let sessionKeys = new Set<string>();
  try {
    await installFrameInstrumentation(context);
    await installPreviewLifecycleAudit(context);
    const page = await context.newPage();
    const previewObserver = observePreviewSessions(page);
    sessionKeys = previewObserver.keys;
    const coldOpenStarted = performance.now();
    await page.goto(`${origin}/wrapt/orbit`);
    await page.bringToFront();
    await expect(page.locator(".orbit-page")).toBeVisible();
    await expect(page.locator(".orbit-board-picker-trigger")).toBeEnabled();
    const coldOpenDurationMs = Number((performance.now() - coldOpenStarted).toFixed(2));
    await expect(page.locator(".orbit-preview-slot .preview-slot-frame iframe")).toHaveCount(PERF_SCENARIOS.stress.previews, { timeout: 30_000 });
    const frame = page.frameLocator(".orbit-preview-slot .preview-slot-frame iframe");
    await expect(frame.locator("#root")).toHaveText("SPA bereit", { timeout: 30_000 });
    const previewReadyDurationMs = Number((performance.now() - coldOpenStarted).toFixed(2));
    const { activeNodes, activeEdges, activeIframes } = await captureStableFixture(page, PERF_SCENARIOS.stress);
    const gestures = await measureCanvasGestures(page, context, PERF_FIXTURE.gestureDurationMs, PERF_FIXTURE.primaryNoteId);
    await captureStableFixture(page, PERF_SCENARIOS.stress);
    const previewTransitions = await measurePreviewRouteMatrix(page, request, origin, previewObserver);
    const routes = await measureRoutes(page);
    return {
      gestures,
      routes,
      previewTransitions,
      coldOpenDurationMs,
      previewReadyDurationMs,
      longTaskObserverSupported: gestures.every((gesture) => gesture.longTaskObserverSupported),
      activeNodes,
      activeEdges,
      activeIframes,
    };
  } finally {
    await context.close();
    for (const key of sessionKeys) {
      await request.delete(`${origin}/api/v1/previews/sessions/by-key/${encodeURIComponent(key)}`, { headers: PERF_HEADERS });
    }
  }
}

test("erfasst fünf Orbit-Performance-Läufe je Fixture im isolierten E2E-Server", async ({ browser, request }, testInfo) => {
  testInfo.setTimeout(1_200_000);
  const startedAt = new Date().toISOString();
  const safe = await assertIsolatedHarness();
  const healthResponse = await request.get(new URL("/api/v1/health", safe.origin).toString(), { headers: PERF_HEADERS });
  if (!healthResponse.ok()) throw new Error(`Der konfigurierte isolierte E2E-Server antwortet nicht (${healthResponse.status()}).`);
  const health = await healthResponse.json() as { version?: string };
  const viewportMatch = (process.env.WRAPT_ORBIT_PERF_VIEWPORT ?? "1440x960").match(/^(\d+)x(\d+)$/)!;
  const viewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };
  const deviceScaleFactor = Number(process.env.WRAPT_ORBIT_PERF_DPR ?? "1");
  const contextOptions: BrowserContextOptions = {
    viewport, deviceScaleFactor, hasTouch: true, locale: "de-DE", extraHTTPHeaders: PERF_HEADERS,
  };
  const repetitions: Array<{ index: number; small: CanvasScenarioRun; stress: StressScenarioRun }> = [];
  let browserMetadata: Record<string, unknown> | null = null;
  await writeProgressSnapshot(safe.outputPrefix, {
    startedAt,
    completedRepetitions: 0,
    plannedRepetitions: PERF_FIXTURE.repetitions,
    scenarios: ["small", "stress"],
    repetitions,
  });

  for (let index = 1; index <= PERF_FIXTURE.repetitions; index += 1) {
    console.info(`[Orbit-Performance] Lauf ${index}/${PERF_FIXTURE.repetitions}: kleine Fläche startet.`);
    const smallCapture = await measureSmallScenario(browser, request, safe.origin, contextOptions);
    const { browserMetadata: smallBrowserMetadata, ...small } = smallCapture;
    browserMetadata ??= smallBrowserMetadata;
    console.info(`[Orbit-Performance] Lauf ${index}/${PERF_FIXTURE.repetitions}: Stressfläche startet.`);
    const stress = await measureStressScenario(browser, request, safe.origin, contextOptions);
    repetitions.push({ index, small, stress });
    await writeProgressSnapshot(safe.outputPrefix, {
      startedAt,
      completedRepetitions: repetitions.length,
      plannedRepetitions: PERF_FIXTURE.repetitions,
      scenarios: ["small", "stress"],
      repetitions,
    });
    console.info(`[Orbit-Performance] Lauf ${index}/${PERF_FIXTURE.repetitions}: beide Szenarien gespeichert.`);
  }

  const gestureNames = ["pan", "zoom-wheel", "zoom-pinch", "drag", "resize"];
  const summarizeScenario = (scenario: PerformanceScenario) => {
    const longTaskObserverSupported = repetitions.every((run) => run[scenario].longTaskObserverSupported);
    return {
      repetitions: repetitions.length,
      longTaskObserverSupported,
      gestures: gestureNames.map((name) => {
        const runs = repetitions.flatMap((run) => run[scenario].gestures).filter((gesture) => gesture.name === name);
        return {
          name,
          frames: summarize(runs.flatMap((run) => run.frameIntervalsMs)),
          frameCoveragePercent: summarize(runs.map((run) => run.frameCoveragePercent)),
          documentVisible: runs.every((run) => run.documentVisible),
          longTasks: summarizeLongTasks(longTaskObserverSupported ? runs.flatMap((run) => run.longTaskDurationsMs ?? []) : null),
        };
      }),
    };
  };
  const previewRoutePairs = [
    ["orbit-node", "orbit-preview-page"],
    ["orbit-preview-page", "previews"],
    ["previews", "orbit-node"],
  ];
  const summary = {
    scenarios: { small: summarizeScenario("small"), stress: summarizeScenario("stress") },
    routes: summarize(repetitions.flatMap((run) => run.stress.routes.samples.map((sample) => sample.durationMs))),
    previewTransitions: previewRoutePairs.map(([from, to]) => ({
      from,
      to,
      metrics: summarize(repetitions.flatMap((run) => run.stress.previewTransitions.samples
        .filter((sample) => sample.from === from && sample.to === to).map((sample) => sample.durationMs))),
    })),
    coldOpen: summarize(repetitions.map((run) => run.stress.coldOpenDurationMs)),
    previewReady: summarize(repetitions.map((run) => run.stress.previewReadyDurationMs)),
  };
  const samplesFor = (scenario: PerformanceScenario) => repetitions.flatMap((run) => run[scenario].gestures);
  const performanceGates = {
    frameSampleCoverageAtLeast90Percent: (["small", "stress"] as const).every((scenario) => repetitions.every((run) =>
      run[scenario].gestures.every((gesture) => gesture.documentVisible && gesture.frameCoveragePercent >= 90))),
    smallCanvasP95AtMost16_7Ms: summary.scenarios.small.gestures.every((gesture) => gesture.frames.p95Ms !== null && gesture.frames.p95Ms <= 16.7),
    stressCanvasP95AtMost33_3Ms: summary.scenarios.stress.gestures.every((gesture) => gesture.frames.p95Ms !== null && gesture.frames.p95Ms <= 33.3),
    noRepeatedFrameStallsOver100Ms: (["small", "stress"] as const).every((scenario) =>
      repetitions.every((run) => run[scenario].gestures.every((gesture) => gesture.frames.stallsOver100ms <= 1))),
    noRepeatedLongTasksOver100Ms: (["small", "stress"] as const).every((scenario) => summary.scenarios[scenario].longTaskObserverSupported)
      ? (["small", "stress"] as const).every((scenario) => samplesFor(scenario).every((gesture) => gesture.longTasks.over100ms !== null && gesture.longTasks.over100ms <= 1))
      : null,
    warmOrbitNotesP95AtMost250Ms: summary.routes.p95Ms !== null && summary.routes.p95Ms <= 250,
    previewRouteP95AtMost250Ms: summary.previewTransitions.every((route) => route.metrics.p95Ms !== null && route.metrics.p95Ms <= 250),
  };
  const result = {
    metadata: {
      startedAt,
      os: hostMetadata(),
      browser: { name: "Google Chrome", version: browser.version(), ...(browserMetadata ?? {}) },
      longTaskObserverSupported: {
        small: summary.scenarios.small.longTaskObserverSupported,
        stress: summary.scenarios.stress.longTaskObserverSupported,
      },
      serverVersion: health.version ?? "unknown",
      viewport,
      deviceScaleFactor,
      energyMode: process.env.WRAPT_ORBIT_PERF_ENERGY_MODE,
      frameTimeP95GatesMs: { small: 16.7, stress: 33.3 },
      frameCoverageGatePercent: 90,
      fixture: {
        scenarios: {
          small: { ...PERF_SCENARIOS.small, repetitions: PERF_FIXTURE.repetitions, gestureDurationMs: PERF_FIXTURE.gestureDurationMs },
          stress: { ...PERF_SCENARIOS.stress, repetitions: PERF_FIXTURE.repetitions, gestureDurationMs: PERF_FIXTURE.gestureDurationMs },
        },
        previewFixture: "tests/fixtures/preview-apps/server.mjs:spa",
        previewPort: PERF_FIXTURE.previewPort,
      },
      limitations: ["Windows-Messungen und Vorher-Baseline bleiben offen.", "Projekt-Devserver-Startzeit und Terminal-Zoom werden nicht gemessen.", "Long Tasks stammen aus dem Wrapt-Hauptdokument; der cross-origin Preview-iframe ist nicht Teil des Frame-Observers."],
    },
    summary,
    performanceGates,
    repetitions,
  };
  await writeReport(safe.outputPrefix, result);
  const gateFindings = repetitions.flatMap((run) => run.stress.previewTransitions.gateFindings.map((finding) => `Lauf ${run.index}: ${finding}`));
  expect(gateFindings, "Preview-Integrationsgates; Rohmessungen wurden bereits gespeichert").toEqual([]);
  const failedPerformanceGates = Object.entries(performanceGates).filter(([, passed]) => passed === false).map(([name]) => name);
  expect(failedPerformanceGates, "Performance-Gates; Rohmessungen wurden bereits gespeichert").toEqual([]);
});
