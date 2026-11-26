import { z } from "zod";

export const isoDateSchema = z.iso.datetime({ offset: true });

export const serviceModeSchema = z.enum(["embedded", "external", "hybrid"]);

export const serviceStateSchema = z.enum([
  "active",
  "inactive",
  "error",
  "unknown",
  "checking",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).nullable().default(null),
    requestId: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string().min(1),
  appName: z.string().min(1),
  // Bei gestaffelten Updates können ältere Server dieses Feld noch nicht liefern.
  // Neue Server setzen es immer; Clients erkennen die fehlende Instanzkennung als Versionshinweis.
  instanceName: z.string().min(1).optional(),
  timestamp: isoDateSchema,
  // Zufalls-ID pro Serverprozess. Wechselt der Wert, wurde das Backend neu gestartet.
  bootId: z.string().min(1),
  // mtime (ms) von apps/web/dist/index.html. Wechselt der Wert, wurde das Frontend neu gebaut.
  webBuildId: z.number().int().nullable(),
});

// Optionale Host-Funktionen, die der Server freischaltet. Die Oberfläche
// leitet daraus ab, welche Routen und Navigationseinträge registriert werden.
// Ein fehlendes Feld gilt bewusst als "nicht verfügbar".
export const hostCapabilitiesSchema = z.object({
  opencodeWeb: z.boolean().default(false),
});

export const dashboardSectionSchema = z.enum([
  "quickActions",
  "server",
  "metrics",
  "wrapt",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "commands",
]);

export const dashboardConfigSchema = z.object({
  // Zeitfenster des serverseitigen Verlaufs. Die Anzahl der Punkte ergibt sich
  // aus dem Messintervall und ist auf 720 begrenzt.
  historyMilliseconds: z.number().int().min(60_000).max(86_400_000).default(3_600_000),
  sections: z.object({
    quickActions: z.boolean().default(true),
    server: z.boolean().default(true),
    metrics: z.boolean().default(true),
    wrapt: z.boolean().default(true),
    services: z.boolean().default(true),
    runtime: z.boolean().default(true),
    diagnostics: z.boolean().default(true),
    usage: z.boolean().default(true),
    commands: z.boolean().default(true),
  }).prefault({}),
  refresh: z.object({
    healthMilliseconds: z.number().int().min(1_000).max(300_000).default(5_000),
    summaryMilliseconds: z.number().int().min(1_000).max(300_000).default(30_000),
    metricsMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    servicesMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    localPortsMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    terminalSessionsMilliseconds: z.number().int().min(1_000).max(30_000).default(3_000),
    operationalMetricsMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    usageMilliseconds: z.number().int().min(10_000).max(600_000).default(60_000),
  }).prefault({}),
}).prefault({});

export const readinessResponseSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  timestamp: isoDateSchema,
  checks: z.array(z.object({
    name: z.string().min(1),
    status: z.enum(["ok", "failed"]),
  })),
});

// T3 Code läuft als genau eine Instanz hinter dem /t3-Proxy. Der Kanal bestimmt nur,
// welches npm-Paket (t3@latest bzw. t3@nightly) beim nächsten Neustart installiert wird —
// beide Kanäle teilen sich dasselbe Datenverzeichnis (~/.t3/userdata).
// ── Open-in-Editor (T3-Code-Shim) ─────────────────────────────────────────────
// T3 Code ruft beim „Open in Editor" (Command O) auf dem Server `code <pfad>`
// auf. Das Shim-Skript meldet den Pfad per HTTP an die Workbench; diese leitet
// ihn per WebSocket an den Browser, der den code-server mit dem Ordner öffnet.
// Der Pfad bleibt dabei ein Serverwert — er wird nie vom Browser gesetzt.
export const editorOpenRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096).startsWith("/").refine((path) => !path.includes("\0")),
  line: z.number().int().min(1).max(10_000_000).optional(),
  column: z.number().int().min(1).max(10_000_000).optional(),
});

export const editorOpenEventSchema = z.object({
  type: z.literal("editor.open"),
  path: z.string().startsWith("/").max(4_096),
  file: z.string().startsWith("/").max(4_096).optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  requestId: z.string().optional(),
});

export type EditorOpenEvent = z.infer<typeof editorOpenEventSchema>;

export const t3ChannelSchema = z.enum(["stable", "nightly"]);

export const t3ChannelRequestSchema = z.object({ channel: t3ChannelSchema });

export const t3ChannelStatusResponseSchema = z.object({
  // In der Config hinterlegter Wunschkanal. Greift erst nach einem Neustart.
  configuredChannel: t3ChannelSchema,
  // Aus der installierten Version abgeleitet; null, wenn T3 nicht installiert ist.
  activeChannel: t3ChannelSchema.nullable(),
  activeVersion: z.string().nullable(),
  installed: z.boolean(),
  // Antwortet die Instanz auf 127.0.0.1:<port>? Nur Anzeige, kein Kriterium für den Wechsel.
  reachable: z.boolean(),
  // configured ≠ active — das UI zeigt dann den Hinweis auf die Neustart-Buttons.
  restartRequired: z.boolean(),
  serviceUnit: z.string().min(1),
  port: z.number().int().positive(),
  checkedAt: isoDateSchema,
});

export const tailscaleSummarySchema = z.object({
  state: z.enum(["connected", "disconnected", "unknown"]),
  hostname: z.string().nullable(),
  dnsName: z.string().nullable(),
});

export const serverSummarySchema = z.object({
  serverName: z.string().min(1),
  status: z.enum(["online", "offline"]),
  operatingSystem: z.object({
    platform: z.string(),
    distro: z.string(),
    release: z.string(),
    kernel: z.string(),
  }),
  uptimeSeconds: z.number().nonnegative(),
  tailscale: tailscaleSummarySchema,
  lastUpdated: isoDateSchema,
});

// CPU-Metadaten und Kernwerte. Marke und Kernanzahl sind statisch, die Last-
// und Temperaturreihen folgen der jeweiligen Messung. Ältere Server liefern
// das Feld nicht; Clients müssen es daher als optional behandeln.
export const serverCpuMetricsSchema = z.object({
  brand: z.string(),
  cores: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
  coreLoadPercent: z.array(z.number().min(0).max(100)),
  coreTemperatures: z.array(z.number().nullable()),
});

export const serverNetworkInterfaceMetricsSchema = z.object({
  name: z.string().min(1),
  receivedBytesPerSecond: z.number().nonnegative().nullable(),
  transmittedBytesPerSecond: z.number().nonnegative().nullable(),
});

export const serverNetworkMetricsSchema = z.object({
  receivedBytesPerSecond: z.number().nonnegative().nullable(),
  transmittedBytesPerSecond: z.number().nonnegative().nullable(),
  interfaces: z.array(serverNetworkInterfaceMetricsSchema).default([]),
});

export const serverDiskIoMetricsSchema = z.object({
  readBytesPerSecond: z.number().nonnegative().nullable(),
  writeBytesPerSecond: z.number().nonnegative().nullable(),
});

export const serverTopProcessSchema = z.object({
  pid: z.number().int().positive(),
  name: z.string().min(1),
  cpuPercent: z.number().nonnegative(),
  memoryBytes: z.number().nonnegative(),
});

export const serverMetricHistorySampleSchema = z.object({
  timestamp: isoDateSchema,
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  networkReceivedBytesPerSecond: z.number().nonnegative().nullable().optional(),
  networkTransmittedBytesPerSecond: z.number().nonnegative().nullable().optional(),
  diskReadBytesPerSecond: z.number().nonnegative().nullable().optional(),
  diskWriteBytesPerSecond: z.number().nonnegative().nullable().optional(),
  temperatureCelsius: z.number().nullable().optional(),
});

export const serverMetricsSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  memory: z.object({
    usedBytes: z.number().nonnegative(),
    totalBytes: z.number().positive(),
    availableBytes: z.number().nonnegative(),
  }),
  disks: z.array(
    z.object({
      mount: z.string(),
      usedBytes: z.number().nonnegative(),
      totalBytes: z.number().nonnegative(),
      availableBytes: z.number().nonnegative(),
      usedPercent: z.number().min(0).max(100),
    }),
  ),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
  temperatureCelsius: z.number().nullable(),
  // Optionale Erweiterungen; fehlen sie, stammt die Antwort von einem älteren Server.
  cpu: serverCpuMetricsSchema.optional(),
  network: serverNetworkMetricsSchema.optional(),
  diskIo: serverDiskIoMetricsSchema.optional(),
  topProcesses: z.array(serverTopProcessSchema).max(5).default([]),
  // Alte Browser validieren `history` noch mit max(25). Der lange Verlauf für
  // neue Clients liegt deshalb in einem eigenen Feld.
  history: z.array(serverMetricHistorySampleSchema).max(25).default([]),
  historyExtended: z.array(serverMetricHistorySampleSchema).max(720).default([]),
  lastUpdated: isoDateSchema,
});

export const serviceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  mode: serviceModeSchema,
  state: serviceStateSchema,
  publicUrl: z.url().nullable(),
  message: z.string().optional(),
  lastChecked: isoDateSchema,
});

export const servicesResponseSchema = z.object({ services: z.array(serviceSchema) });

export const localPortSchema = z.object({
  port: z.number().int().min(1).max(65_535),
  address: z.string().min(1),
  process: z.string().min(1).nullable(),
  pid: z.number().int().positive().nullable().default(null),
  projectId: z.string().min(1).nullable().default(null),
  projectName: z.string().min(1).nullable().default(null),
  protocol: z.enum(["http", "https", "unknown"]),
  localUrl: z.url().nullable(),
  proxyUrl: z.string().startsWith("/").nullable(),
});

export const localPortsResponseSchema = z.object({
  ports: z.array(localPortSchema),
  scannedAt: isoDateSchema,
});

export const commandSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  command: z.string().min(1),
});

export const commandsResponseSchema = z.object({ commands: z.array(commandSchema) });

export type ApiError = z.infer<typeof apiErrorSchema>;

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type HostCapabilities = z.infer<typeof hostCapabilitiesSchema>;

export type DashboardSection = z.infer<typeof dashboardSectionSchema>;

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export type T3Channel = z.infer<typeof t3ChannelSchema>;

export type T3ChannelRequest = z.infer<typeof t3ChannelRequestSchema>;

export type T3ChannelStatusResponse = z.infer<typeof t3ChannelStatusResponseSchema>;

export type ServerSummary = z.infer<typeof serverSummarySchema>;

export type ServerCpuMetrics = z.infer<typeof serverCpuMetricsSchema>;

export type ServerNetworkInterfaceMetrics = z.infer<typeof serverNetworkInterfaceMetricsSchema>;

export type ServerNetworkMetrics = z.infer<typeof serverNetworkMetricsSchema>;

export type ServerDiskIoMetrics = z.infer<typeof serverDiskIoMetricsSchema>;

export type ServerTopProcess = z.infer<typeof serverTopProcessSchema>;

export type ServerMetricHistorySample = z.infer<typeof serverMetricHistorySampleSchema>;

export type ServerMetrics = z.infer<typeof serverMetricsSchema>;

export type ServiceMode = z.infer<typeof serviceModeSchema>;

export type Service = z.infer<typeof serviceSchema>;

export type ServicesResponse = z.infer<typeof servicesResponseSchema>;

export type LocalPort = z.infer<typeof localPortSchema>;

export type LocalPortsResponse = z.infer<typeof localPortsResponseSchema>;

export type CommandReference = z.infer<typeof commandSchema>;

export type CommandsResponse = z.infer<typeof commandsResponseSchema>;
