import { z, type ZodType } from "zod";
import {
  codexResetHistoryResponseSchema,
  codexResetHistorySettingsSchema,
  type CodexResetHistoryResponse,
  type CodexResetHistorySettings,
} from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { persistCodexResetHistorySettings, readCodexResetHistorySettings } from "../config/wrapt-config.js";

const API_ROOT = "https://codex-resets.com/api/v1";
const DEFAULT_CACHE_MILLISECONDS = 15 * 60 * 1_000;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

const upstreamResetSchema = z.object({
  id: z.string().min(1),
  reset_type: z.enum(["regular", "banked"]),
  announced_at: z.iso.datetime({ offset: true }),
  text: z.string(),
  source: z.object({ url: z.url() }),
});

const upstreamStatusSchema = z.object({
  data: z.object({
    latest_reset: upstreamResetSchema.nullable(),
    stats: z.object({
      total: z.number().int().nonnegative(),
      last_reset_at: z.iso.datetime({ offset: true }).nullable(),
      days_since_last: z.number().nonnegative().nullable(),
      avg_interval_days: z.number().nonnegative().nullable(),
    }),
  }),
});

const upstreamListSchema = z.object({
  data: z.array(upstreamResetSchema).max(100),
});

interface CodexResetHistoryServiceOptions {
  configDirectory: string;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  cacheMilliseconds?: number;
}

interface CachedHistory {
  response: CodexResetHistoryResponse;
  cachedAt: number;
}

function emptyStats() {
  return { total: 0, lastResetAt: null, daysSinceLast: null, averageIntervalDays: null };
}

function disabledResponse(): CodexResetHistoryResponse {
  return codexResetHistoryResponseSchema.parse({
    enabled: false,
    status: "disabled",
    resets: [],
    stats: emptyStats(),
    fetchedAt: null,
    lastSuccessfulFetchAt: null,
    error: null,
  });
}

export class CodexResetHistoryService {
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private readonly cacheMilliseconds: number;
  private cached: CachedHistory | undefined;
  private pending: Promise<CodexResetHistoryResponse> | undefined;

  constructor(private readonly options: CodexResetHistoryServiceOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.now = options.now ?? Date.now;
    this.cacheMilliseconds = options.cacheMilliseconds ?? DEFAULT_CACHE_MILLISECONDS;
  }

  getSettings(): CodexResetHistorySettings {
    return readCodexResetHistorySettings(this.options.configDirectory);
  }

  updateSettings(input: CodexResetHistorySettings): CodexResetHistorySettings {
    const next = codexResetHistorySettingsSchema.parse(input);
    persistCodexResetHistorySettings(this.options.configDirectory, next);
    this.invalidate();
    return next;
  }

  invalidate(): void {
    if (this.cached) this.cached.cachedAt = 0;
  }

  async get(): Promise<CodexResetHistoryResponse> {
    if (!this.getSettings().enabled) return disabledResponse();
    const currentTime = this.now();
    if (this.cached && currentTime - this.cached.cachedAt < this.cacheMilliseconds) return this.cached.response;
    if (this.pending) return this.pending;
    this.pending = this.load()
      .catch((error: unknown) => this.fallback(error))
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async load(): Promise<CodexResetHistoryResponse> {
    const [status, list] = await Promise.all([
      this.fetchJson(`${API_ROOT}/status`, upstreamStatusSchema),
      this.fetchJson(`${API_ROOT}/resets?limit=20`, upstreamListSchema),
    ]);
    const fetchedAt = new Date(this.now()).toISOString();
    const response = codexResetHistoryResponseSchema.parse({
      enabled: true,
      status: "available",
      resets: list.data.map((reset) => ({
        id: reset.id,
        resetType: reset.reset_type,
        announcedAt: reset.announced_at,
        text: reset.text,
        sourceUrl: reset.source.url,
      })),
      stats: {
        total: status.data.stats.total,
        lastResetAt: status.data.stats.last_reset_at ?? status.data.latest_reset?.announced_at ?? null,
        daysSinceLast: status.data.stats.days_since_last,
        averageIntervalDays: status.data.stats.avg_interval_days,
      },
      fetchedAt,
      lastSuccessfulFetchAt: fetchedAt,
      error: null,
    });
    this.cached = { response, cachedAt: this.now() };
    return response;
  }

  private async fetchJson<T>(url: string, schema: ZodType<T>): Promise<T> {
    const response = await this.fetchImplementation(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) throw new Error(`Codex-Reset-API HTTP ${response.status}`);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Codex-Reset-API lieferte ein ungültiges Datenformat");
    return parsed.data;
  }

  private fallback(error: unknown): CodexResetHistoryResponse {
    const message = error instanceof Error ? error.message : "Codex-Reset-Historie konnte nicht geladen werden";
    if (this.cached) {
      return codexResetHistoryResponseSchema.parse({ ...this.cached.response, status: "stale", error: message });
    }
    return codexResetHistoryResponseSchema.parse({
      enabled: true,
      status: "unavailable",
      resets: [],
      stats: emptyStats(),
      fetchedAt: null,
      lastSuccessfulFetchAt: null,
      error: message,
    });
  }
}

export const codexResetHistoryService = new CodexResetHistoryService({ configDirectory: settings.configDirectory });
