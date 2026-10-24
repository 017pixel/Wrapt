import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, request, type APIRequestContext } from "@playwright/test";

export const identity = { "tailscale-user-login": "user@example.com" };
const reservedPortStart = Number(process.env.WRAPT_E2E_RESERVED_PORT_START ?? NaN);
const reservedPortEnd = Number(process.env.WRAPT_E2E_RESERVED_PORT_END ?? NaN);

function overlapsReservedPorts(port: number) {
  return Number.isFinite(reservedPortStart) && Number.isFinite(reservedPortEnd)
    && port < reservedPortEnd && port + 200 > reservedPortStart;
}

async function freePortBlock() {
  for (let attempt = 0; attempt < 20; attempt++) {
    // Blöcke atomar reservieren, damit parallele Starts nicht überlappen.
    const port = 20_000 + Math.floor(Math.random() * 150) * 200;
    if (overlapsReservedPorts(port)) continue;
    const lock = join(tmpdir(), `wrapt-persona-port-${port}`);
    try { await mkdir(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    const reservations = [];
    let reserved = false;
    try {
      for (const offset of [0, 1, 2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 120]) {
        const listener = createServer();
        await new Promise<void>((resolve, reject) => {
          listener.once("error", reject);
          listener.listen(port + offset, "127.0.0.1", resolve);
        });
        reservations.push(listener);
      }
      reserved = true;
      return { port, release: () => rm(lock, { recursive: true, force: true }) };
    } catch {
      // Belegte Ports gehören anderen Diensten. Nur eigene Reservierungen lösen.
    } finally {
      await Promise.all(reservations.map((listener) => new Promise<void>((resolve) => listener.close(() => resolve()))));
      if (!reserved) await rm(lock, { recursive: true, force: true });
    }
  }
  throw new Error("Kein freier Portbereich für den Persona-Worker gefunden.");
}

export async function startWorkerServer(workerIndex: number) {
  const root = await mkdtemp(join(tmpdir(), "wrapt-persona-"));
  const { port, release } = await freePortBlock();
  const origin = `http://127.0.0.1:${port}`;
  const resultsDirectory = process.env.WRAPT_E2E_RESULTS_DIR?.trim();
  const logs = resultsDirectory ? resolve(resultsDirectory, "servers") : resolve("test-results", "servers");
  await mkdir(logs, { recursive: true });
  const logPath = join(logs, `worker-${workerIndex}.log`);
  const log = createWriteStream(logPath);
  const child = spawn(process.execPath, ["scripts/start-e2e-server.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      WRAPT_E2E_EXTERNAL: "false",
      WRAPT_E2E_ROOT: root,
      WRAPT_E2E_KEEP_ROOT: "true",
      WRAPT_E2E_PORT: String(port),
      WRAPT_E2E_T3_CHANNEL: "stable",
      WRAPT_E2E_USER: identity["tailscale-user-login"],
      // Funktionstests pollen API und Browser aus einer Identität: Das
      // Produktions-Limit (1200/min) würde mitten im Lauf 429 werfen und den
      // Restore kaskadierend abbrechen. Der Schutz selbst bleibt über
      // Unit-Tests mit kleinen Budgets abgedeckt.
      API_RATE_LIMIT_MAX: "100000",
    },
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: identity });
  const stop = async () => {
    await api.dispose();
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exited;
    log.end();
    await rm(root, { recursive: true, force: true });
    await release();
  };
  try {
    await expect.poll(async () => {
      if (child.exitCode !== null) throw new Error(`Persona-Server beendet; siehe ${logPath}`);
      try { return (await api.get("/api/v1/health", { timeout: 2_000 })).status(); }
      catch { return 0; }
    }, { timeout: 30_000, message: "Isolierter Persona-Server wird bereit" }).toBe(200);
    return { origin, api, stop, logPath, databasePath: join(root, "data", "wrapt.sqlite") };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function getJson(api: APIRequestContext, path: string) {
  const response = await api.get(`/api/v1${path}`);
  await expect(response).toBeOK();
  return response.json();
}

export async function putJson(api: APIRequestContext, path: string, data: unknown) {
  const response = await api.put(`/api/v1${path}`, { data });
  await expect(response).toBeOK();
  return response.json();
}
