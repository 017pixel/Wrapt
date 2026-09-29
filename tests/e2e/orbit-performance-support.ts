import { createServer } from "node:net";
import { access, readFile, realpath } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fixturePorts } from "../fixtures/preview-apps/server.mjs";

export const PERF_FIXTURE = {
  repetitions: 5,
  gestureDurationMs: 6_000,
  previewPort: fixturePorts.spa as number,
  boardId: "orbit-perf-fixed-board",
  previewNodeId: "orbit-perf-preview",
  primaryNoteId: "orbit-perf-note-00",
  previewStorageProfileId: "7d74b3c2-a7c9-4fc8-a404-3d2fb56e7b04",
};

export const PERF_SCENARIOS = {
  small: { name: "typical-small-area", nodes: 12, edges: 8, previews: 0 },
  stress: { name: "80-node-stress", nodes: 80, edges: 60, previews: 1 },
} as const;
export type PerformanceScenario = keyof typeof PERF_SCENARIOS;

export const PERF_LOGIN = "user@example.com";
export const PERF_HEADERS = { "tailscale-user-login": PERF_LOGIN };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt; der Performance-Lauf braucht eine explizite E2E-Isolation.`);
  return value;
}

function inside(root: string, value: string): boolean {
  const path = relative(root, resolve(value));
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export async function assertFileDoesNotExist(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Ausgabedatei existiert bereits; zum Schutz vor Überschreiben abgebrochen: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function assertIsolatedHarness(): Promise<{ root: string; outputPrefix: string; origin: string }> {
  for (const name of ["WRAPT_E2E_EXTERNAL", "WRAPT_E2E_ISOLATED", "WRAPT_E2E_KEEP_ROOT", "WRAPT_ORBIT_PERF_ALLOW_ISOLATED_RESET"]) {
    if (required(name) !== "true") throw new Error(`${name} muss ausdrücklich true sein.`);
  }
  const root = resolve(required("WRAPT_E2E_ROOT"));
  const tempRoot = resolve(tmpdir());
  const actualRoot = await realpath(root);
  const actualTempRoot = await realpath(tempRoot);
  if (!inside(tempRoot, root) || root === tempRoot || !inside(actualTempRoot, actualRoot) || actualRoot === actualTempRoot) {
    throw new Error("Die E2E-Root muss ein realer eigener Unterordner von tmpdir() sein.");
  }

  const port = Number(required("WRAPT_E2E_PORT"));
  const url = new URL(required("WRAPT_E2E_URL"));
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || Number(url.port) !== port || port < 1_024 || port === 3_010) {
    throw new Error("Die E2E-URL muss auf den dedizierten Loopback-Port aus WRAPT_E2E_PORT zeigen.");
  }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("WRAPT_E2E_URL muss nur den isolierten Origin enthalten.");

  const configPath = resolve(root, "config/wrapt.local.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    system?: { user?: string; homeDirectory?: string };
    paths?: Record<string, string>;
    tailscale?: { allowedUsers?: string[] };
  };
  if (config.system?.user !== "e2e" || resolve(config.system.homeDirectory ?? "") !== root) {
    throw new Error("Die konfigurierte Server-Root ist nicht als isolierte E2E-Root markiert.");
  }
  for (const name of ["dataDir", "orbitBackupDir", "orbitAssetDir", "databasePath"]) {
    const value = config.paths?.[name];
    if (!value || !inside(root, value)) throw new Error(`Die E2E-Konfiguration verweist mit paths.${name} nach außerhalb der Test-Root.`);
    try {
      const actualPath = await realpath(value);
      if (!inside(actualRoot, actualPath)) throw new Error(`paths.${name} verlässt die isolierte E2E-Root über einen Symlink.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const actualParent = await realpath(dirname(value));
      if (!inside(actualRoot, actualParent)) {
        throw new Error(`Der übergeordnete Ordner von paths.${name} verlässt die isolierte E2E-Root.`, { cause: error });
      }
    }
  }
  if (!config.tailscale?.allowedUsers?.includes(PERF_LOGIN)) throw new Error("Die isolierte E2E-Identität ist nicht freigeschaltet.");

  const outputPrefix = required("WRAPT_ORBIT_PERF_OUTPUT");
  if (!isAbsolute(outputPrefix)) throw new Error("WRAPT_ORBIT_PERF_OUTPUT muss ein absoluter Dateipräfix sein.");
  await assertFileDoesNotExist(`${outputPrefix}.json`);
  await assertFileDoesNotExist(`${outputPrefix}.md`);
  await assertFileDoesNotExist(`${outputPrefix}.progress.json`);
  required("WRAPT_ORBIT_PERF_ENERGY_MODE");
  return { root, outputPrefix, origin: url.origin };
}

function canBind(port: number): Promise<void> {
  return new Promise((resolveFree, reject) => {
    const server = createServer();
    server.once("error", (cause) => {
      reject(new Error(`Preview-Fixture-Port ${port} ist belegt; kein Fixture wurde gestartet: ${cause.message}`, { cause }));
    });
    server.listen(port, "127.0.0.1", () => server.close((error) => error ? reject(error) : resolveFree()));
  });
}

export async function assertFixturePortsFree(): Promise<void> {
  const ports = Object.values(fixturePorts) as number[];
  for (const port of ports) await canBind(port);
}

function makeNode(id: string, title: string, x: number, y: number, type: "note" | "previewSlot" = "note") {
  return {
    id, type, title, position: { x, y },
    size: type === "previewSlot" ? { width: 480, height: 360 } : { width: 320, height: 220 },
    projectId: type === "previewSlot" ? "wrapt" : null, parentId: null, runtimeId: null, toolType: null, previewId: null,
    previewTarget: type === "previewSlot" ? String(PERF_FIXTURE.previewPort) : null,
    previewPath: "/", previewDeviceId: null, previewOrientation: "landscape",
    previewSlotId: null, previewStorageProfileId: type === "previewSlot" ? PERF_FIXTURE.previewStorageProfileId : null, previewIsolation: true,
    provider: null, content: `Feste Orbit-Performance-Fixture ${id}`, language: null,
    color: null, noteId: null, locked: false, zIndex: type === "previewSlot" ? 2 : 1,
  };
}

export function createPerformanceWorkspace(scenarioName: PerformanceScenario = "stress") {
  const scenario = PERF_SCENARIOS[scenarioName];
  const notes = Array.from({ length: scenario.nodes - scenario.previews }, (_, index) => {
    const column = scenarioName === "small" ? index % 3 : index % 10;
    const row = scenarioName === "small" ? Math.floor(index / 3) : Math.floor(index / 10);
    const x = scenarioName === "small" ? 100 + column * 390 : 540 + column * 420;
    const y = scenarioName === "small" ? 60 + row * 280 : 80 + row * 310;
    return makeNode(`orbit-perf-note-${String(index).padStart(2, "0")}`, `Messpunkt ${String(index + 1).padStart(2, "0")}`, x, y);
  });
  const preview = scenario.previews > 0 ? [makeNode(PERF_FIXTURE.previewNodeId, "Isolierte SPA-Fixture", 20, 30, "previewSlot")] : [];
  const edges = Array.from({ length: scenario.edges }, (_, index) => ({
    id: `orbit-perf-edge-${String(index).padStart(2, "0")}`,
    source: notes[index % notes.length]!.id,
    target: notes[(index + 1) % notes.length]!.id,
    kind: "manual",
    label: null,
  }));
  return {
    version: 8,
    activeBoardId: PERF_FIXTURE.boardId,
    focusedNodeId: null,
    boards: [{
      id: PERF_FIXTURE.boardId,
      name: scenarioName === "small" ? "Orbit-Performance kleine Fläche" : "Orbit-Performance 80/60",
      viewport: { x: 0, y: 0, zoom: 1 },
      worldBounds: { minX: -1_000, minY: -1_000, maxX: 5_000, maxY: 4_000 },
      nodes: [...preview, ...notes],
      edges,
    }],
  };
}

export function summarize(values: number[]) {
  if (values.length === 0) return { count: 0, medianMs: null, p95Ms: null, p99Ms: null, maxMs: null, stallsOver100ms: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    count: values.length,
    medianMs: Number(median.toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    p99Ms: Number(percentile(0.99).toFixed(2)),
    maxMs: Number(sorted.at(-1)!.toFixed(2)),
    stallsOver100ms: values.filter((value) => value > 100).length,
  };
}

export function summarizeLongTasks(tasks: number[] | null) {
  if (tasks === null) return { supported: false, count: null, totalMs: null, maxMs: null, over100ms: null };
  return {
    supported: true,
    count: tasks.length,
    totalMs: Number(tasks.reduce((sum, value) => sum + value, 0).toFixed(2)),
    maxMs: tasks.length ? Number(Math.max(...tasks).toFixed(2)) : 0,
    over100ms: tasks.filter((value) => value > 100).length,
  };
}

export function hostMetadata() {
  return { platform: platform(), release: release(), arch: arch() };
}
