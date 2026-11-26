import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deriveHistorySampling } from "./systemService.js";

const counters = { temperature: 0, disks: 0, network: 0, diskIo: 0, processes: 0, cpu: 0 };
const failures = { cpu: false, network: false, diskIo: false, processes: false, temperature: false, disks: false };
const sampleProcesses = [
  { pid: 101, name: "alpha", command: "alpha", cpu: 4.5, memRss: 100 },
  { pid: 102, name: "beta", command: "beta", cpu: 22.5, memRss: 200 },
  { pid: 103, name: "gamma", command: "gamma", cpu: 12, memRss: 300 },
  { pid: 104, name: "delta", command: "delta", cpu: 22.5, memRss: 400 },
  { pid: 105, name: "epsilon", command: "epsilon", cpu: 1, memRss: 50 },
  { pid: 106, name: "zeta", command: "zeta", cpu: 0, memRss: 10 },
];
const sampleNetwork = [
  { iface: "eth0", rx_sec: 1024, tx_sec: 2048 },
  { iface: "wlan0", rx_sec: null, tx_sec: 512 },
];

vi.mock("systeminformation", () => ({
  default: {
    osInfo: async () => ({ platform: "linux", distro: "Test", release: "1", kernel: "1" }),
    time: () => ({ uptime: 1 }),
    currentLoad: async () => ({ currentLoad: 10, cpus: [{ load: 12.5 }, { load: 87.5 }] }),
    mem: async () => ({ active: 1, total: 4, available: 3 }),
    fsSize: async () => {
      counters.disks += 1;
      if (failures.disks) throw new Error("fsSize");
      return [{ size: 100, used: 50, mount: "/", type: "ext4", use: 50 }];
    },
    cpuTemperature: async () => {
      counters.temperature += 1;
      if (failures.temperature) throw new Error("temperature");
      return { main: 42, cores: [41, 55, -1] };
    },
    cpu: async () => {
      counters.cpu += 1;
      if (failures.cpu) throw new Error("cpu");
      return { brand: "Test CPU", cores: 4, physicalCores: 2 };
    },
    networkStats: async () => {
      counters.network += 1;
      if (failures.network) throw new Error("network");
      return sampleNetwork;
    },
    fsStats: async () => {
      counters.diskIo += 1;
      if (failures.diskIo) throw new Error("fsStats");
      return { rx_sec: 512, wx_sec: 256 };
    },
    processes: async () => {
      counters.processes += 1;
      if (failures.processes) throw new Error("processes");
      return { list: sampleProcesses };
    },
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  for (const key of Object.keys(counters) as Array<keyof typeof counters>) counters[key] = 0;
  for (const key of Object.keys(failures) as Array<keyof typeof failures>) failures[key] = false;
});
afterEach(() => vi.useRealTimers());

async function loadService() {
  return (await import("./systemService.js")).systemService;
}

it("lädt Temperatur und Disks höchstens alle 30 Sekunden neu, Prozesse kurz", async () => {
  const systemService = await loadService();
  await systemService.getMetrics();
  expect(counters.temperature).toBe(1);
  expect(counters.disks).toBe(1);
  expect(counters.network).toBe(1);
  expect(counters.diskIo).toBe(1);
  expect(counters.processes).toBe(1);
  expect(counters.cpu).toBe(1);

  await vi.advanceTimersByTimeAsync(6_000);
  await systemService.getMetrics();
  expect(counters.temperature).toBe(1);
  expect(counters.disks).toBe(1);
  expect(counters.network).toBe(2);
  expect(counters.diskIo).toBe(2);
  expect(counters.processes).toBe(1);
  expect(counters.cpu).toBe(1);

  await vi.advanceTimersByTimeAsync(5_000);
  await systemService.getMetrics();
  expect(counters.processes).toBe(2);

  await vi.advanceTimersByTimeAsync(21_000);
  await systemService.getMetrics();
  expect(counters.temperature).toBe(2);
  expect(counters.disks).toBe(2);
  expect(counters.processes).toBe(3);

  systemService.invalidateMetrics();
  await systemService.getMetrics();
  expect(counters.temperature).toBe(3);
  expect(counters.disks).toBe(3);
  expect(counters.processes).toBe(4);
  expect(counters.cpu).toBe(1);
});

it("liefert Kerne, Temperaturen, Netzwerk, Disk-I/O und die fünf stärksten Prozesse", async () => {
  const systemService = await loadService();
  systemService.startMetricsHistory();
  await vi.advanceTimersByTimeAsync(0);
  const metrics = await systemService.getMetrics();

  expect(metrics.cpu).toEqual({
    brand: "Test CPU",
    cores: 4,
    physicalCores: 2,
    coreLoadPercent: [12.5, 87.5],
    coreTemperatures: [41, 55, null],
  });
  expect(metrics.network).toEqual({
    receivedBytesPerSecond: 1024,
    transmittedBytesPerSecond: 2560,
    interfaces: [
      { name: "eth0", receivedBytesPerSecond: 1024, transmittedBytesPerSecond: 2048 },
      { name: "wlan0", receivedBytesPerSecond: null, transmittedBytesPerSecond: 512 },
    ],
  });
  expect(metrics.diskIo).toEqual({ readBytesPerSecond: 512, writeBytesPerSecond: 256 });
  expect(metrics.topProcesses).toHaveLength(5);
  expect(metrics.topProcesses[0]).toEqual({ pid: 104, name: "delta", cpuPercent: 22.5, memoryBytes: 400 * 1024 });
  expect(metrics.topProcesses.some((process) => process.pid === 106)).toBe(false);
  expect(metrics.history.at(-1)).toMatchObject({
    networkReceivedBytesPerSecond: 1024,
    networkTransmittedBytesPerSecond: 2560,
    diskReadBytesPerSecond: 512,
    diskWriteBytesPerSecond: 256,
    temperatureCelsius: 42,
  });

  await vi.advanceTimersByTimeAsync(5_000);
  const next = await systemService.getMetrics();
  expect(next.history).toHaveLength(2);
  systemService.stopMetricsHistory();
});

it("liefert bei fehlenden Messwerten null beziehungsweise leere Listen", async () => {
  failures.cpu = true;
  failures.network = true;
  failures.diskIo = true;
  failures.processes = true;
  failures.temperature = true;
  const systemService = await loadService();
  const metrics = await systemService.getMetrics();

  expect(metrics.cpu).toEqual({
    brand: "",
    cores: 2,
    physicalCores: 0,
    coreLoadPercent: [12.5, 87.5],
    coreTemperatures: [],
  });
  expect(metrics.temperatureCelsius).toBeNull();
  expect(metrics.network).toEqual({ receivedBytesPerSecond: null, transmittedBytesPerSecond: null, interfaces: [] });
  expect(metrics.diskIo).toEqual({ readBytesPerSecond: null, writeBytesPerSecond: null });
  expect(metrics.topProcesses).toEqual([]);
});

it("begrenzt den Verlauf auf 720 Punkte", async () => {
  const systemService = await loadService();
  systemService.startMetricsHistory();
  await vi.advanceTimersByTimeAsync(5_000 * 725);
  const metrics = await systemService.getMetrics();
  systemService.stopMetricsHistory();

  expect(metrics.historyExtended).toHaveLength(720);
  expect(metrics.history).toHaveLength(25);
});

it("verteilt 720 Punkte auf ein langes Verlaufsfenster", () => {
  const oneHour = deriveHistorySampling(3_600_000, 5_000);
  const oneDay = deriveHistorySampling(86_400_000, 5_000);

  expect(oneHour).toEqual({ sampleMilliseconds: 5_000, maximumSamples: 720 });
  expect(oneDay).toEqual({ sampleMilliseconds: 120_000, maximumSamples: 720 });
  expect(oneDay.sampleMilliseconds * oneDay.maximumSamples).toBe(86_400_000);
});

it("erweitert den Verlauf nicht bei wiederholten Messabfragen", async () => {
  const systemService = await loadService();
  await systemService.getMetrics();
  await systemService.getMetrics();
  await systemService.getMetrics();

  expect((await systemService.getMetrics()).history).toHaveLength(0);
});

it("verwendet für Prozesse ohne Namen nur die PID, nie die Kommandozeile", async () => {
  const original = [...sampleProcesses];
  sampleProcesses.splice(0, sampleProcesses.length, { pid: 107, name: "", command: "geheim --flag", cpu: 99, memRss: 10 });
  try {
    const systemService = await loadService();
    const metrics = await systemService.getMetrics();
    expect(metrics.topProcesses[0]?.name).toBe("PID 107");
    expect(JSON.stringify(metrics.topProcesses)).not.toContain("geheim");
  } finally {
    sampleProcesses.splice(0, sampleProcesses.length, ...original);
  }
});

it("versucht cpu() nach einem Fehler erneut statt null zu cachen", async () => {
  failures.cpu = true;
  const systemService = await loadService();
  const first = await systemService.getMetrics();
  expect(first.cpu?.brand).toBe("");

  failures.cpu = false;
  await vi.advanceTimersByTimeAsync(5_000);
  const second = await systemService.getMetrics();
  expect(second.cpu?.brand).toBe("Test CPU");
  expect(counters.cpu).toBe(2);
});

it("liefert bei einem fsSize-Fehler eine leere Laufwerksliste statt 500", async () => {
  failures.disks = true;
  const systemService = await loadService();
  const metrics = await systemService.getMetrics();

  expect(metrics.disks).toEqual([]);
});
