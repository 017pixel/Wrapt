#!/usr/bin/env node
import { setTimeout } from "node:timers/promises";

const base = process.env.WRAPT_E2E_URL;
if (!base || process.env.WRAPT_E2E_ISOLATED !== "true") {
  throw new Error("Performance-Probe benötigt WRAPT_E2E_URL und WRAPT_E2E_ISOLATED=true für eine eigene Testinstanz.");
}
const origin = new URL(base);
if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Die Performance-Probe läuft ausschließlich auf einer lokalen Testinstanz.");
const headers = { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" };
const samples = [];

async function read(path) {
  const response = await fetch(new URL(`/api/v1${path}`, origin), { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// Drei gleichzeitige Leser bilden mehrere offene Clients nach. Jeder liest
// regelmäßig, statt den Server mit einem unrealistischen Burst zu überfluten.
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let index = 0; index < 40; index++) {
    const started = performance.now();
    await read("/health");
    samples.push(performance.now() - started);
    await setTimeout(25);
  }
}));
samples.sort((left, right) => left - right);
const metrics = await read("/system/operational-metrics");
const percentile = (fraction) => Number(samples[Math.floor((samples.length - 1) * fraction)].toFixed(2));
const report = {
  clients: 3,
  samples: samples.length,
  healthP50Milliseconds: percentile(0.5),
  healthP95Milliseconds: percentile(0.95),
  eventLoop: metrics.eventLoop,
  terminalSync: metrics.notificationSyncs?.terminal ?? null,
  budgets: { healthP95Milliseconds: 100, eventLoopP99Milliseconds: 100 },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.healthP95Milliseconds > report.budgets.healthP95Milliseconds || metrics.eventLoop.p99Milliseconds > report.budgets.eventLoopP99Milliseconds) {
  throw new Error("Das Laufzeitbudget wurde überschritten. Messung und konkurrierende Last prüfen.");
}
