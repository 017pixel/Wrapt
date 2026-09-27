#!/usr/bin/env node
// Isolierter CodexBar-Ersatz für die Screenshot-Instanz. Liefert ausschließlich
// erfundene Limit- und Kostendaten für Codex und OpenCode Go; alles bleibt unter
// 127.0.0.1 und wird nur vom Fixture-Server abgefragt.
import { createServer } from "node:http";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("Der CodexBar-Fixture-Port ist ungültig.");
}

const startedAt = Date.now();
const iso = (offsetMilliseconds) => new Date(startedAt + offsetMilliseconds).toISOString();

function codexUsage() {
  return [{
    provider: "codex",
    source: "oauth",
    account: "arbeit@example.com",
    usage: {
      accountEmail: "arbeit@example.com",
      loginMethod: "ChatGPT Plus",
      updatedAt: iso(0),
      identity: { accountEmail: "arbeit@example.com", loginMethod: "ChatGPT Plus" },
      primary: { usedPercent: 42, windowMinutes: 300, resetsAt: iso(2 * 60 * 60 * 1000) },
      secondary: { usedPercent: 61, windowMinutes: 10_080, resetsAt: iso(5 * 24 * 60 * 60 * 1000) },
      codexResetCredits: {
        availableCount: 2,
        updatedAt: iso(0),
        credits: [
          { id: "reset-1", title: "Frühjahrs-Bonus", description: "Zusätzlicher Reset", status: "available", granted_at: iso(-2 * 24 * 60 * 60 * 1000), expires_at: iso(20 * 24 * 60 * 60 * 1000) },
          { id: "reset-2", title: "Team-Gutschrift", description: "Zusätzlicher Reset", status: "available", granted_at: iso(-1 * 24 * 60 * 60 * 1000), expires_at: iso(30 * 24 * 60 * 60 * 1000) },
        ],
      },
    },
  }];
}

function openCodeUsage() {
  return [{
    provider: "opencodego",
    source: "oauth",
    account: "demo@example.com",
    usage: {
      accountEmail: "demo@example.com",
      loginMethod: "OpenCode Go",
      updatedAt: iso(0),
      identity: { accountEmail: "demo@example.com", loginMethod: "OpenCode Go" },
      primary: { usedPercent: 18, windowMinutes: 300, resetsAt: iso(3 * 60 * 60 * 1000) },
      secondary: { usedPercent: 37, windowMinutes: 10_080, resetsAt: iso(4 * 24 * 60 * 60 * 1000) },
    },
  }];
}

function dailyPoints(seed, days) {
  const points = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startedAt - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const inputTokens = 40_000 + seed * 800 + index * 1_300;
    const outputTokens = 12_000 + seed * 400 + index * 620;
    points.push({
      date,
      inputTokens,
      outputTokens,
      cacheReadTokens: 8_000 + index * 150,
      cacheCreationTokens: 1_200 + index * 40,
      totalTokens: inputTokens + outputTokens + 8_000 + index * 150 + 1_200 + index * 40,
      totalCost: Number((0.42 + seed * 0.05 + index * 0.012).toFixed(3)),
      modelBreakdowns: [
        { modelName: "gpt-5.1", totalTokens: inputTokens + outputTokens, cost: 0.31 },
        { modelName: "gpt-5.1-mini", totalTokens: 6_000, cost: 0.07 },
      ],
    });
  }
  return points;
}

function codexCost() {
  return [{
    provider: "codex",
    source: "oauth",
    updatedAt: iso(0),
    daily: dailyPoints(2, 21),
    projects: [
      { name: "nordlicht", project: "nordlicht", projectPath: "nordlicht", totalTokens: 612_400, totalCost: 8.94 },
      { name: "feldnotiz", project: "feldnotiz", projectPath: "feldnotiz", totalTokens: 284_100, totalCost: 4.12 },
      { name: "sandkasten", project: "sandkasten", projectPath: "sandkasten", totalTokens: 96_800, totalCost: 1.35 },
    ],
  }];
}

function openCodeCost() {
  return [{
    provider: "opencodego",
    source: "oauth",
    updatedAt: iso(0),
    daily: dailyPoints(1, 14),
    projects: [
      { name: "nordlicht", project: "nordlicht", projectPath: "nordlicht", totalTokens: 188_200, totalCost: 1.92 },
      { name: "sandkasten", project: "sandkasten", projectPath: "sandkasten", totalTokens: 54_300, totalCost: 0.58 },
    ],
  }];
}

function respond(response, body, status = 200) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const provider = url.searchParams.get("provider");
  if (url.pathname === "/health") return respond(response, { ok: true });
  if (url.pathname === "/usage" && provider === "codex") return respond(response, codexUsage());
  if (url.pathname === "/usage" && provider === "opencodego") return respond(response, openCodeUsage());
  if (url.pathname === "/usage") return respond(response, []);
  if (url.pathname === "/cost" && provider === "codex") return respond(response, codexCost());
  if (url.pathname === "/cost" && provider === "opencodego") return respond(response, openCodeCost());
  if (url.pathname === "/cost") return respond(response, []);
  return respond(response, { error: "not found" }, 404);
});

server.listen(port, "127.0.0.1");
