import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hermesStatusSchema, hermesUpdateStateSchema, type HermesStatus, type HermesUpdateState } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { HermesClientError } from "./client.js";
import type { HermesDashboardClient } from "./client.js";
import type { HermesAcpManager } from "./acp/Manager.js";
import { serviceState } from "./service-control.js";
import { createAsyncCache, type AsyncCache } from "../utils/cache.js";

const execFileAsync = promisify(execFile);

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function defaultUpdateState(): HermesUpdateState {
  return { phase: "idle", pending: false, lastCheckedAt: null, lastStartedAt: null, lastFinishedAt: null, lastResult: "none", previousVersion: null, previousCommit: null, newVersion: null, newCommit: null, deferredSince: null, lastFullBackupAt: null, logTail: [] };
}

export function readHermesUpdateState(): HermesUpdateState {
  try {
    return hermesUpdateStateSchema.parse(JSON.parse(readFileSync(join(settings.dataDirectory, "hermes/update-state.json"), "utf8")) as unknown);
  } catch {
    return defaultUpdateState();
  }
}

async function checkoutCommit(): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["-C", settings.hermes.checkoutDirectory, "rev-parse", "HEAD"], { timeout: 5_000, maxBuffer: 64 * 1024 });
    const value = result.stdout.trim();
    return /^[a-f0-9]{40}$/i.test(value) ? value : null;
  } catch { return null; }
}

function telegramConnected(value: unknown): boolean | null {
  const platforms = object(value);
  const telegram = platforms.telegram;
  if (typeof telegram === "boolean") return telegram;
  if (telegram && typeof telegram === "object") {
    const item = telegram as Record<string, unknown>;
    if (typeof item.connected === "boolean") return item.connected;
    if (typeof item.running === "boolean") return item.running;
    if (item.state === "connected" || item.state === "running") return true;
    if (typeof item.state === "string") return false;
  }
  return null;
}

export class HermesStatusService {
  private readonly commitCache: AsyncCache<string | null>;
  private readonly statusCache: AsyncCache<Awaited<ReturnType<HermesStatusService["loadFacts"]>>>;
  private updateVersion: string | undefined;

  constructor(private readonly client: HermesDashboardClient, private readonly manager: HermesAcpManager,
    private readonly sources = { serviceState, checkoutCommit, readUpdateState: readHermesUpdateState,
      installed: () => existsSync(settings.hermes.cliPath) && existsSync(settings.hermes.pythonPath) }) {
    // Die Instanz gehört genau einer Dashboard-/Dienstkonfiguration.
    this.commitCache = createAsyncCache(settings.hermesCommitCacheMilliseconds, sources.checkoutCommit);
    this.statusCache = createAsyncCache(settings.hermesStatusCacheMilliseconds, () => this.loadFacts());
  }

  invalidate(commit = false): void {
    this.statusCache.clear();
    if (commit) this.commitCache.clear();
  }

  private async loadFacts() {
    const installed = this.sources.installed();
    const [dashboardState, gatewayState, rawStatus, rawModel] = await Promise.all([
      this.sources.serviceState("dashboard"), this.sources.serviceState("gateway"),
      this.client.get("/api/status").then((raw) => object(raw)).catch((error: unknown) => {
        if (!(error instanceof HermesClientError)) throw error;
        return null;
      }),
      this.client.get("/api/model/info").then((raw) => object(raw)).catch(() => null),
    ]);
    return {
      installed, dashboardState, gatewayState, reachable: rawStatus !== null,
      version: typeof rawStatus?.version === "string" ? rawStatus.version : null,
      provider: typeof rawModel?.provider === "string" ? rawModel.provider : null,
      model: typeof rawModel?.model === "string" ? rawModel.model : null,
      gatewayTelegram: telegramConnected(rawStatus?.gateway_platforms),
      gatewayError: typeof rawStatus?.gateway_exit_reason === "string" ? rawStatus.gateway_exit_reason.slice(0, 500) : null,
    };
  }

  async get(): Promise<HermesStatus> {
    const checkedAt = new Date().toISOString();
    if (!settings.hermes.enabled) return hermesStatusSchema.parse({
      enabled: false, installed: false, reachable: false, version: null, commit: null, provider: null, model: null,
      dashboard: { state: "inactive", reachable: false, url: `${settings.hermes.proxyPrefix}/` },
      gateway: { state: "unknown", telegramConnected: null, lastError: null },
      chat: { transport: "unavailable", ready: false, activeSessions: 0 },
      update: { available: false, pending: false, running: false, currentVersion: null, latestVersion: null, lastCheckedAt: null, lastUpdatedAt: null, lastResult: "none" },
      checkedAt,
    });

    const update = this.sources.readUpdateState();
    const updateVersion = `${update.phase}:${update.previousCommit}:${update.newCommit}:${update.lastFinishedAt}`;
    if (this.updateVersion !== updateVersion) { this.invalidate(true); this.updateVersion = updateVersion; }
    const [facts, commit] = await Promise.all([this.statusCache.get(), this.commitCache.get()]);
    const { installed, reachable, version, provider, model, dashboardState, gatewayState, gatewayTelegram, gatewayError } = facts;
    return hermesStatusSchema.parse({
      enabled: true,
      installed,
      reachable,
      version,
      commit,
      provider,
      model,
      dashboard: { state: dashboardState, reachable, url: `${settings.hermes.proxyPrefix}/` },
      gateway: { state: gatewayState, telegramConnected: gatewayTelegram, lastError: gatewayError },
      chat: { transport: installed ? "acp" : "unavailable", ready: installed && this.manager.ready, activeSessions: this.manager.activeSessionCount() },
      update: { available: update.pending, pending: update.pending, running: update.phase === "running", currentVersion: update.previousVersion, latestVersion: update.newVersion, lastCheckedAt: update.lastCheckedAt, lastUpdatedAt: update.lastFinishedAt, lastResult: update.lastResult },
      checkedAt,
    });
  }
}
