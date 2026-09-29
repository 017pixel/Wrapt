import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertFileDoesNotExist } from "./orbit-performance-support";
import type { PerformanceScenario, summarize } from "./orbit-performance-support";

type LongTaskSummary = {
  supported: boolean;
  count: number | null;
  totalMs: number | null;
  maxMs: number | null;
  over100ms: number | null;
};

type GestureReport = {
  name: string;
  durationMs: number;
  frameCoveragePercent: number;
  documentVisible: boolean;
  frames: ReturnType<typeof summarize>;
  frameIntervalsMs: number[];
  longTasks: LongTaskSummary;
  longTaskObserverSupported: boolean;
  longTaskDurationsMs: number[] | null;
};

type PreviewTransitionReport = {
  from: string;
  to: string;
  durationMs: number;
  sessionId: string;
  slotId: number;
  ownActiveSlotCount: number;
  slotStatusVerified: boolean;
  activeIframeIds: number[];
  mountCount: number;
  unmountCount: number;
  navigationCount: number;
  sameSession: boolean;
  sameSlot: boolean;
  sameIframeElementAsInitial: boolean;
  sentinelPreserved: boolean | null;
};

type CanvasScenarioReport = {
  gestures: GestureReport[];
  longTaskObserverSupported: boolean;
  activeNodes: number;
  activeEdges: number;
  activeIframes: number;
};

type StressScenarioReport = CanvasScenarioReport & {
  routes: { warmupTransitions: number; samples: Array<{ to: string; durationMs: number }> };
  previewTransitions: { samples: PreviewTransitionReport[]; gateFindings: string[] };
  coldOpenDurationMs: number;
  previewReadyDurationMs: number;
};

type ScenarioSummary = {
  repetitions: number;
  longTaskObserverSupported: boolean;
  gestures: Array<{
    name: string;
    frames: ReturnType<typeof summarize>;
    frameCoveragePercent: ReturnType<typeof summarize>;
    documentVisible: boolean;
    longTasks: LongTaskSummary;
  }>;
};

type FixtureScenarioMetadata = {
  name: string;
  nodes: number;
  edges: number;
  previews: number;
  repetitions: number;
  gestureDurationMs: number;
};

export type OrbitPerformanceReport = {
  metadata: {
    startedAt: string;
    os: { platform: string; release: string; arch: string };
    browser: { name: string; version: string };
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    energyMode: string | undefined;
    frameTimeP95GatesMs: { small: number; stress: number };
    frameCoverageGatePercent: number;
    longTaskObserverSupported: { small: boolean; stress: boolean };
    fixture: {
      scenarios: Record<PerformanceScenario, FixtureScenarioMetadata>;
      previewFixture: string;
      previewPort: number;
    };
    limitations: string[];
  };
  summary: {
    scenarios: Record<PerformanceScenario, ScenarioSummary>;
    routes: ReturnType<typeof summarize>;
    previewTransitions: Array<{ from: string; to: string; metrics: ReturnType<typeof summarize> }>;
    coldOpen: ReturnType<typeof summarize>;
    previewReady: ReturnType<typeof summarize>;
  };
  performanceGates: Record<string, boolean | null>;
  repetitions: Array<{ index: number; small: CanvasScenarioReport; stress: StressScenarioReport }>;
};

export function markdownReport(result: OrbitPerformanceReport): string {
  const scenarioNames: PerformanceScenario[] = ["small", "stress"];
  const scenarioTitle = (name: PerformanceScenario) => name === "small" ? "Kleine Fläche (60 Hz)" : "Stressfläche (80/60)";
  const aggregateGestures = scenarioNames.flatMap((scenario) => result.summary.scenarios[scenario].gestures.map((gesture) =>
    `| ${scenarioTitle(scenario)} | ${gesture.name} | ${gesture.frames.medianMs ?? "–"} | ${gesture.frames.p95Ms ?? "–"} | ${gesture.frames.p99Ms ?? "–"} | ${gesture.frameCoveragePercent.medianMs ?? "–"} | ${gesture.documentVisible ? "ja" : "nein"} | ${gesture.frames.stallsOver100ms} | ${longTaskLabel(gesture.longTasks)} |`));
  const rows = result.repetitions.flatMap((run) => scenarioNames.flatMap((scenario) => run[scenario].gestures.map((gesture) =>
    `| ${run.index} | ${scenarioTitle(scenario)} | ${gesture.name} | ${gesture.frames.medianMs ?? "–"} | ${gesture.frames.p95Ms ?? "–"} | ${gesture.frames.p99Ms ?? "–"} | ${gesture.frameCoveragePercent} | ${gesture.documentVisible ? "ja" : "nein"} | ${gesture.frames.stallsOver100ms} | ${longTaskLabel(gesture.longTasks)} |`)));
  const aggregateRoute = result.summary.routes;
  const routes = result.repetitions.flatMap((run) => run.stress.routes.samples.map((sample) => `| ${run.index} | ${sample.to} | ${sample.durationMs} |`));
  const previewRoutes = result.repetitions.flatMap((run) => run.stress.previewTransitions.samples.map((sample) =>
    `| ${run.index} | ${sample.from} → ${sample.to} | ${sample.durationMs} | ${sample.sessionId} | ${sample.slotId} | ${sample.ownActiveSlotCount} (${sample.slotStatusVerified ? "ja" : "zuletzt geprüft"}) | ${sample.activeIframeIds.join(", ") || "–"} | ${sample.mountCount}/${sample.unmountCount}/${sample.navigationCount} | ${sample.sameSession}/${sample.sameSlot}/${sample.sameIframeElementAsInitial} | ${sample.sentinelPreserved} |`));
  const previewRouteRows = result.summary.previewTransitions.map((route) =>
    `| ${route.from} → ${route.to} | ${route.metrics.medianMs ?? "–"} | ${route.metrics.p95Ms ?? "–"} | ${route.metrics.p99Ms ?? "–"} |`);
  const gateFindings = result.repetitions.flatMap((run) => run.stress.previewTransitions.gateFindings.map((finding) => `- Lauf ${run.index}: ${finding}`));
  const runRows = result.repetitions.flatMap((run) => scenarioNames.map((scenario) => {
    const sample = run[scenario];
    const coldOpen = "coldOpenDurationMs" in sample ? sample.coldOpenDurationMs : "–";
    const previewReady = "previewReadyDurationMs" in sample ? sample.previewReadyDurationMs : "–";
    return `| ${run.index} | ${scenarioTitle(scenario)} | ${sample.activeNodes} | ${sample.activeEdges} | ${sample.activeIframes} | ${coldOpen} | ${previewReady} | ${sample.longTaskObserverSupported ? "ja" : "nicht verfügbar"} |`;
  }));
  const performanceGates = Object.entries(result.performanceGates).map(([name, passed]) =>
    `| ${gateLabel(name)} | ${passed === null ? "nicht verfügbar" : passed ? "bestanden" : "nicht bestanden"} |`);
  const cold = result.summary.coldOpen;
  const previewReady = result.summary.previewReady;
  const fixtureRows = scenarioNames.map((name) => {
    const fixture = result.metadata.fixture.scenarios[name];
    return `| ${scenarioTitle(name)} | ${fixture.repetitions} | ${fixture.nodes} | ${fixture.edges} | ${fixture.previews} | ${fixture.gestureDurationMs} |`;
  });
  return [
    "# Orbit-Performance-Messung",
    "",
    `- Zeitpunkt: ${result.metadata.startedAt}`,
    `- Host: ${result.metadata.os.platform} ${result.metadata.os.release} (${result.metadata.os.arch})` ,
    `- Browser: ${result.metadata.browser.name} ${result.metadata.browser.version}`,
    `- Viewport / DPR: ${result.metadata.viewport.width}×${result.metadata.viewport.height} / ${result.metadata.deviceScaleFactor}`,
    `- Energiemodus: ${result.metadata.energyMode}`,
    `- p95-Grenzen: kleine Fläche ≤${result.metadata.frameTimeP95GatesMs.small} ms; Stressfläche ≤${result.metadata.frameTimeP95GatesMs.stress} ms`,
    `- Mindestabdeckung der RAF-Zeitreihe: ${result.metadata.frameCoverageGatePercent} % je Geste; Dokument muss sichtbar sein`,
    `- LongTask-Observer: kleine Fläche ${result.metadata.longTaskObserverSupported.small ? "unterstützt" : "nicht verfügbar"}; Stressfläche ${result.metadata.longTaskObserverSupported.stress ? "unterstützt" : "nicht verfügbar"}`,
    "",
    "## Szenarien und Wiederholungen",
    "",
    "Jeder Laufindex enthält einen Messlauf pro Szenario. Damit liegen fünf vollständige Wiederholungen für die kleine Fläche und fünf für die Stressfläche vor.",
    "| Szenario | Läufe | Knoten | Kanten | Preview-iframes | Dauer je Geste (ms) |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...fixtureRows,
    "",
    "| Lauf | Szenario | aktive Knoten | aktive Kanten | iframes | kalte Orbit-Ansicht (ms) | erstes SPA-Ready (ms) | LongTask-Observer |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...runRows,
    "- Beide Szenarien messen Pan, Wheel-Zoom, Pinch-Zoom, Knoten-Drag und Resize je sechs Sekunden pro Geste.",
    "- Preview: eine lokale SPA-Test-Fixture; keine Nutzer- oder Projekt-Preview.",
    "",
    `Kalte Orbit-Erstansicht (frischer Browser-Kontext): Median ${cold.medianMs ?? "–"} ms, p95 ${cold.p95Ms ?? "–"} ms, p99 ${cold.p99Ms ?? "–"} ms über ${cold.count} Läufe.`,
    `Erstes „SPA bereit“ im iframe: Median ${previewReady.medianMs ?? "–"} ms, p95 ${previewReady.p95Ms ?? "–"} ms, p99 ${previewReady.p99Ms ?? "–"} ms.`,
    "",
    "## Aggregierte Framewerte über fünf Läufe je Szenario",
    "",
    "Frame-Perzentile je Geste basieren auf allen `requestAnimationFrame`-Intervallen der fünf Wiederholungen. Die Abdeckung vergleicht deren aufsummierte Zeit mit der Hostdauer; unter dem Gate sind die Zeitperzentile nicht belastbar.",
    "| Szenario | Geste | Median (ms) | p95 (ms) | p99 (ms) | RAF-Abdeckung (Median %) | Dokument sichtbar | Frames >100 ms | Long Tasks (Anzahl / ms) |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |",
    ...aggregateGestures,
    "",
    "| Performance-Gate | Ergebnis |",
    "| --- | --- |",
    ...performanceGates,
    "",
    `Warme Orbit↔Notes-Wechsel: Median ${aggregateRoute.medianMs ?? "–"} ms, p95 ${aggregateRoute.p95Ms ?? "–"} ms, p99 ${aggregateRoute.p99Ms ?? "–"} ms über ${aggregateRoute.count} Wechsel.`,
    "",
    "| Preview-Routenwechsel (aggregiert) | Median (ms) | p95 (ms) | p99 (ms) |",
    "| --- | ---: | ---: | ---: |",
    ...previewRouteRows,
    "",
    "## Framezeiten und Long Tasks",
    "",
    "| Lauf | Szenario | Geste | Median (ms) | p95 (ms) | p99 (ms) | RAF-Abdeckung % | Dokument sichtbar | Frames >100 ms | Long Tasks (Anzahl / ms) |",
    "| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |",
    ...rows,
    "",
    "## Warme Routenwechsel",
    "",
    "| Lauf | Zielroute | Wechselzeit (ms) |",
    "| ---: | --- | ---: |",
    ...routes,
    "",
    "## Preview-Sessions und iframe-Lebenszyklus",
    "",
    "| Lauf | Wechsel | ms | Session | Slot | aktive Slots (API; geprüft) | iframe-IDs | Mount/Unmount/Navigation | Session/Slot/iframe stabil | localStorage erhalten |",
    "| ---: | --- | ---: | --- | ---: | --- | --- | ---: | --- | --- |",
    ...previewRoutes,
    "",
    "## Preview-Gate-Befunde",
    "",
    ...(gateFindings.length ? gateFindings : ["Keine Abweichung bei Session-ID, Slot-ID, aktiver Slotzahl, iframe-Identität/Navigationszahl oder localStorage-Sentinel erfasst."]),
    "",
    "## Nicht abgedeckt",
    "",
    ...result.metadata.limitations.map((limitation: string) => `- ${limitation}`),
    "",
  ].join("\n");
}

function longTaskLabel(value: LongTaskSummary): string {
  return value.supported ? `${value.count} / ${value.totalMs}` : "nicht verfügbar";
}

function gateLabel(name: string): string {
  const labels: Record<string, string> = {
    frameSampleCoverageAtLeast90Percent: "RAF-Abdeckung ≥90 % und Dokument sichtbar",
    smallCanvasP95AtMost16_7Ms: "Kleine Fläche: p95 ≤16,7 ms (60 Hz)",
    stressCanvasP95AtMost33_3Ms: "Stressfläche: p95 ≤33,3 ms",
  };
  return labels[name] ?? name;
}

export async function writeReport(prefix: string, result: OrbitPerformanceReport): Promise<void> {
  const jsonPath = resolve(`${prefix}.json`);
  const markdownPath = resolve(`${prefix}.md`);
  await mkdir(dirname(jsonPath), { recursive: true });
  await assertFileDoesNotExist(jsonPath);
  await assertFileDoesNotExist(markdownPath);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  await writeFile(markdownPath, markdownReport(result), { flag: "wx" });
}

export async function writeProgressSnapshot(prefix: string, snapshot: unknown): Promise<void> {
  const path = resolve(`${prefix}.progress.json`);
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporaryPath, path);
}
