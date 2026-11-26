import { hostname, loadavg } from "node:os";
import {
  serverMetricsSchema,
  serverSummarySchema,
  type ServerDiskIoMetrics,
  type ServerMetricHistorySample,
  type ServerMetrics,
  type ServerNetworkMetrics,
  type ServerSummary,
  type ServerTopProcess,
} from "@wrapt/contracts";
import systeminformation, { type Systeminformation } from "systeminformation";
import { readTailscaleStatus } from "../system/tailscale.js";
import { createAsyncCache } from "../utils/cache.js";
import { settings } from "../config/settings.js";

async function loadSummary(): Promise<ServerSummary> {
  const [osInfo, tailscale] = await Promise.all([systeminformation.osInfo(), readTailscaleStatus()]);
  return serverSummarySchema.parse({
    serverName: hostname(),
    status: "online",
    operatingSystem: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
    },
    uptimeSeconds: systeminformation.time().uptime,
    tailscale,
    lastUpdated: new Date().toISOString(),
  });
}

const TEMPERATURE_CACHE_MILLISECONDS = 30_000;
const CPU_IDENTITY_CACHE_MILLISECONDS = 5 * 60_000;
const PROCESS_CACHE_MILLISECONDS = 10_000;
/** Obergrenze des Verlaufs; die tatsächliche Punktzahl folgt aus dashboard.historyMilliseconds. */
const MAXIMUM_HISTORY_SAMPLES = 720;

function clampPercent(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function nonNegativeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function validTemperature(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

interface CpuTemperatureSnapshot {
  main: number | null;
  cores: number[];
}

interface CpuIdentity {
  brand: string;
  cores: number;
  physicalCores: number;
}

/** Temperatur und Disks sind teuer (75–82 ms bzw. 9–16 ms) und ändern sich langsam. */
const temperatureCache = createAsyncCache<CpuTemperatureSnapshot>(TEMPERATURE_CACHE_MILLISECONDS, async () => {
  try {
    const temperature = await systeminformation.cpuTemperature();
    return {
      main: temperature.main,
      cores: Array.isArray(temperature.cores) ? temperature.cores : [],
    };
  } catch {
    return { main: null, cores: [] };
  }
});
const diskCache = createAsyncCache<Systeminformation.FsSizeData[]>(TEMPERATURE_CACHE_MILLISECONDS, async () => {
  try {
    return await systeminformation.fsSize();
  } catch {
    return [];
  }
});

/** Marke und Kernanzahl ändern sich nicht; die Abfrage läuft nur selten. */
const cpuIdentityCache = createAsyncCache<CpuIdentity>(CPU_IDENTITY_CACHE_MILLISECONDS, async () => {
  const cpu = await systeminformation.cpu();
  return {
    brand: typeof cpu.brand === "string" ? cpu.brand.trim() : "",
    cores: nonNegativeInteger(cpu.cores),
    physicalCores: nonNegativeInteger(cpu.physicalCores),
  };
});

function selectTopProcesses(list: readonly Systeminformation.ProcessesProcessData[]): ServerTopProcess[] {
  return list
    .filter((entry) => Number.isFinite(entry.pid) && entry.pid > 0)
    .map((entry) => {
      const memoryKilobytes = nonNegativeNumber(entry.memRss) ?? 0;
      return {
        pid: Math.trunc(entry.pid),
        name: entry.name?.trim() || `PID ${Math.trunc(entry.pid)}`,
        cpuPercent: nonNegativeNumber(entry.cpu) ?? 0,
        memoryBytes: memoryKilobytes * 1024,
      };
    })
    .sort((left, right) => right.cpuPercent - left.cpuPercent || right.memoryBytes - left.memoryBytes)
    .slice(0, 5);
}

/** Die Prozessliste ist teuer (100+ ms) und reicht für das Dashboard kurz zwischengespeichert. */
const processCache = createAsyncCache<ServerTopProcess[]>(PROCESS_CACHE_MILLISECONDS, async () => {
  try {
    const processes = await systeminformation.processes();
    return selectTopProcesses(processes.list ?? []);
  } catch {
    return [];
  }
});

async function loadNetworkMetrics(): Promise<ServerNetworkMetrics> {
  try {
    const stats = await systeminformation.networkStats();
    const interfaces = stats
      .filter((entry) => typeof entry.iface === "string" && entry.iface.trim().length > 0)
      .filter((entry) => {
        const name = entry.iface.toLowerCase();
        return name !== "lo" && !name.startsWith("lo:")
          && !name.startsWith("docker") && !name.startsWith("br-")
          && !name.startsWith("veth") && !name.startsWith("virbr")
          && !name.startsWith("tailscale");
      })
      .map((entry) => ({
        name: entry.iface.trim(),
        receivedBytesPerSecond: nonNegativeNumber(entry.rx_sec),
        transmittedBytesPerSecond: nonNegativeNumber(entry.tx_sec),
      }));
    return {
      receivedBytesPerSecond: interfaces.reduce<number | null>(
        (total, entry) => entry.receivedBytesPerSecond === null ? total : (total ?? 0) + entry.receivedBytesPerSecond,
        null,
      ),
      transmittedBytesPerSecond: interfaces.reduce<number | null>(
        (total, entry) => entry.transmittedBytesPerSecond === null ? total : (total ?? 0) + entry.transmittedBytesPerSecond,
        null,
      ),
      interfaces,
    };
  } catch {
    return { receivedBytesPerSecond: null, transmittedBytesPerSecond: null, interfaces: [] };
  }
}

async function loadDiskIo(): Promise<ServerDiskIoMetrics> {
  try {
    const stats = await systeminformation.fsStats();
    return {
      readBytesPerSecond: nonNegativeNumber(stats?.rx_sec),
      writeBytesPerSecond: nonNegativeNumber(stats?.wx_sec),
    };
  } catch {
    return { readBytesPerSecond: null, writeBytesPerSecond: null };
  }
}

async function loadMetrics(): Promise<ServerMetrics> {
  const [load, memory, fileSystems, temperature, cpuIdentity, network, diskIo, topProcesses] = await Promise.all([
    systeminformation.currentLoad(),
    systeminformation.mem(),
    diskCache.get(),
    temperatureCache.get(),
    cpuIdentityCache.get().catch(() => null),
    loadNetworkMetrics(),
    loadDiskIo(),
    processCache.get(),
  ]);
  const systemLoadAverage = loadavg();

  const physicalFileSystems = fileSystems
    .filter((fileSystem) => fileSystem.size > 0 && fileSystem.mount.startsWith("/") && fileSystem.type !== "tmpfs")
    .map((fileSystem) => ({
      mount: fileSystem.mount,
      usedBytes: fileSystem.used,
      totalBytes: fileSystem.size,
      availableBytes: Math.max(0, fileSystem.size - fileSystem.used),
      usedPercent: Math.min(100, Math.max(0, fileSystem.use)),
    }));

  const coreLoadPercent = (load.cpus ?? []).map((core) => clampPercent(core.load));
  const coreTemperatures = temperature.cores.map((value) => validTemperature(value));
  const hasCoreValues = coreLoadPercent.length > 0 || coreTemperatures.length > 0;
  const cpu = cpuIdentity || hasCoreValues
    ? {
        brand: cpuIdentity?.brand ?? "",
        cores: cpuIdentity?.cores ?? coreLoadPercent.length,
        physicalCores: cpuIdentity?.physicalCores ?? 0,
        coreLoadPercent,
        coreTemperatures,
      }
    : null;

  return serverMetricsSchema.parse({
    cpuPercent: clampPercent(load.currentLoad),
    memory: {
      usedBytes: memory.active,
      totalBytes: memory.total,
      availableBytes: memory.available,
    },
    disks: physicalFileSystems,
    loadAverage: [systemLoadAverage[0] ?? 0, systemLoadAverage[1] ?? 0, systemLoadAverage[2] ?? 0],
    temperatureCelsius: validTemperature(temperature.main),
    ...(cpu ? { cpu } : {}),
    network,
    diskIo,
    topProcesses,
    lastUpdated: new Date().toISOString(),
  });
}

const summaryCache = createAsyncCache(settings.summaryCacheMilliseconds, loadSummary);
const metricsCache = createAsyncCache(settings.metricsCacheMilliseconds, loadMetrics);
const historyMilliseconds = settings.dashboard.historyMilliseconds;

/**
 * Der Verlauf verteilt höchstens 720 Punkte auf das konfigurierte Fenster.
 * Bei kurzen Abfragen und langen Fenstern wird deshalb seltener samples als
 * abgefragt, damit die Achse nicht auf eine Stunde gestaucht wird.
 */
export function deriveHistorySampling(windowMilliseconds: number, cacheMilliseconds: number) {
  const window = Math.max(cacheMilliseconds, windowMilliseconds);
  const sampleMilliseconds = Math.max(cacheMilliseconds, Math.ceil(window / MAXIMUM_HISTORY_SAMPLES));
  return {
    sampleMilliseconds,
    maximumSamples: Math.max(2, Math.min(MAXIMUM_HISTORY_SAMPLES, Math.floor(window / sampleMilliseconds))),
  };
}

const historySampling = deriveHistorySampling(historyMilliseconds, settings.metricsCacheMilliseconds);
const historySampleMilliseconds = historySampling.sampleMilliseconds;
const maximumHistorySamples = historySampling.maximumSamples;
let metricsHistory: ServerMetricHistorySample[] = [];
let metricsHistoryTimer: NodeJS.Timeout | null = null;

function rememberMetrics(metrics: ServerMetrics): void {
  const sample: ServerMetricHistorySample = {
    timestamp: metrics.lastUpdated,
    cpuPercent: metrics.cpuPercent,
    memoryPercent: metrics.memory.totalBytes > 0
      ? Math.min(100, Math.max(0, (metrics.memory.usedBytes / metrics.memory.totalBytes) * 100))
      : 0,
    networkReceivedBytesPerSecond: metrics.network?.receivedBytesPerSecond ?? null,
    networkTransmittedBytesPerSecond: metrics.network?.transmittedBytesPerSecond ?? null,
    diskReadBytesPerSecond: metrics.diskIo?.readBytesPerSecond ?? null,
    diskWriteBytesPerSecond: metrics.diskIo?.writeBytesPerSecond ?? null,
    temperatureCelsius: metrics.temperatureCelsius,
  };
  if (metricsHistory.at(-1)?.timestamp === sample.timestamp) return;
  const cutoff = Date.now() - historyMilliseconds;
  metricsHistory = [...metricsHistory, sample]
    .filter((entry) => Date.parse(entry.timestamp) >= cutoff)
    .slice(-maximumHistorySamples);
}

async function collectMetricsHistory(): Promise<void> {
  try {
    rememberMetrics(await metricsCache.get());
  } catch {
    // Ein temporärer Lesefehler lässt den letzten Verlauf stehen. Der nächste
    // Takt versucht die Messung erneut.
  }
}

export const systemService = {
  getSummary: () => summaryCache.get(),
  async getMetrics() {
    const metrics = await metricsCache.get();
    return serverMetricsSchema.parse({
      ...metrics,
      history: metricsHistory.slice(-25),
      historyExtended: metricsHistory,
    });
  },
  startMetricsHistory() {
    if (metricsHistoryTimer) return;
    void collectMetricsHistory();
    metricsHistoryTimer = setInterval(() => void collectMetricsHistory(), historySampleMilliseconds);
    metricsHistoryTimer.unref();
  },
  /** Erzwungener Refresh (z. B. Dashboard-Button) leert auch die langsamen Caches. */
  invalidateMetrics() {
    metricsCache.clear();
    temperatureCache.clear();
    diskCache.clear();
    processCache.clear();
  },
  stopMetricsHistory() {
    if (!metricsHistoryTimer) return;
    clearInterval(metricsHistoryTimer);
    metricsHistoryTimer = null;
  },
};
