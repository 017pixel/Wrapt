#!/usr/bin/env node
// Wärmt den In-Memory-Messverlauf der isolierten Screenshot-Instanz auf. Das
// Dashboard lädt "/api/v1/server/metrics" nur einmal beim Seitenaufbau und
// bekommt den serverseitigen Verlauf mit; nach einem frischen "--reset" ist der
// sonst fast leer. Zwischen den Abrufen erzeugt ein kurzlebiger Node-Burner
// harmlose CPU-Last auf allen Kernen, damit die Kurve sichtbar schwankt.
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";

const IDENTITY = "screenshot@example.com";
const POLL_INTERVAL_MS = 1_100;
const BURN_ON_MS = 2_000;
const BURN_OFF_MS = 1_500;

function burnerSource(totalMilliseconds) {
  const threads = Math.max(1, Math.min(10, availableParallelism()));
  return `
const { Worker } = require("node:worker_threads");
const spin = "const end = Date.now() + ${BURN_ON_MS}; while (Date.now() < end) {}";
(async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ${totalMilliseconds}) {
    const workers = Array.from({ length: ${threads} }, () => new Worker(spin, { eval: true }));
    await Promise.all(workers.map((worker) => new Promise((resolve) => worker.once("exit", resolve))));
    await new Promise((resolve) => setTimeout(resolve, ${BURN_OFF_MS}));
  }
})();
`;
}

/** Liest die CPU-Werte des serverseitigen Verlaufs, ohne bei Fehlern zu werfen. */
export async function readCpuHistory(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/server/metrics`, {
      headers: { accept: "application/json", "tailscale-user-login": IDENTITY },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return (Array.isArray(payload?.history) ? payload.history : [])
      .map((sample) => Number(sample?.cpuPercent))
      .filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

/**
 * Sammelt so lange Messpunkte samt CPU-Last, bis der Verlauf gefüllt ist.
 * Gibt die erreichten CPU-Werte zurück; wirft nie, damit die Aufnahme läuft.
 */
export async function warmMetricsHistory({ baseUrl, minSamples = 20, timeoutMilliseconds = 40_000, settleMilliseconds = 5_000 }) {
  let history = await readCpuHistory(baseUrl);
  if (history.length >= minSamples) return history;

  const burner = spawn(process.execPath, ["-e", burnerSource(timeoutMilliseconds)], { stdio: "ignore" });
  const deadline = Date.now() + timeoutMilliseconds;
  try {
    while (Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, POLL_INTERVAL_MS));
      history = await readCpuHistory(baseUrl);
      if (history.length >= minSamples) break;
    }
  } finally {
    burner.kill("SIGTERM");
  }
  // Nach dem Burner beruhigt sich die Auslastung; sonst steht die aktuelle
  // Messung auf ~100 % und das Dashboard meldet "CPU dauerhaft am Limit".
  await new Promise((done) => setTimeout(done, settleMilliseconds));
  return readCpuHistory(baseUrl);
}
