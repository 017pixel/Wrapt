import { z } from "zod";
import { previewDevServerStatusSchema, previewExternalOpenModeSchema } from "./preview-runtime.js";
import { isoDateSchema } from "./host-system.js";

// Lebenszyklus einer Slot-Origin. `resetting` und `quarantined` verhindern, dass ein
// fremdes Storage-Profil eine Origin übernimmt, deren Speicher noch nicht nachweislich
// geleert wurde.
export const previewSlotStateSchema = z.enum(["free", "active", "resetting", "quarantined"]);

export const previewAffinityStatusSchema = z.enum(["none", "own", "foreign", "quarantined"]);

export const previewSlotSchema = z.object({
  id: z.number().int().min(1).max(128),
  internalPort: z.number().int().min(1).max(65_535),
  publicPort: z.number().int().min(1).max(65_535),
  targetPort: z.number().int().min(1).max(65_535).nullable(),
  publicUrl: z.url(),
  updatedAt: isoDateSchema.nullable(),
  state: previewSlotStateSchema.default("free"),
  // Storage-Profil des aktuellen Eigentümers. Fremde Profile sehen hier `null`;
  // der interne `storageOwnerKey` verlässt den Server nie.
  storageProfileId: z.string().uuid().nullable().default(null),
  slotGeneration: z.number().int().nonnegative().default(0),
  routingRevision: z.number().int().nonnegative().default(0),
  affinityStatus: previewAffinityStatusSchema.default("none"),
  // Aggregierter Fremdzustand: andere Benutzer erscheinen nur als „belegt“.
  busy: z.boolean().default(false),
});

export const previewSlotsResponseSchema = z.object({
  slots: z.array(previewSlotSchema).max(128),
  assignedSlotId: z.number().int().min(1).max(128).nullable().default(null),
  routingRevision: z.number().int().nonnegative().default(0),
});

export const previewDependencySchema = z.object({
  port: z.number().int().min(1).max(65_535),
  label: z.string().trim().min(1).max(80),
  protocol: z.enum(["auto", "http", "https"]).default("auto"),
  enabled: z.boolean().default(true),
});

export const previewDependenciesResponseSchema = z.object({
  projectId: z.string().min(1),
  primaryPort: z.number().int().min(1).max(65_535),
  dependencies: z.array(previewDependencySchema).max(11),
});

export const previewSessionRequestSchema = z.object({
  sessionKey: z.string().trim().min(1).max(160),
  projectId: z.string().trim().min(1).max(160).nullable().default(null),
  primaryPort: z.number().int().min(1).max(65_535),
  primaryProtocol: z.enum(["http", "https"]).default("http"),
  requestedSlotId: z.number().int().min(1).max(128).nullable().optional(),
  isolate: z.boolean().default(true),
  // Stabile Identität des Preview-Slots in der Preview-Sitzung. Sie entscheidet, ob eine
  // Slot-Origin ohne Storage-Reset wiederverwendet werden darf.
  storageProfileId: z.string().uuid().nullable().default(null),
  expectedRoutingRevision: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
});

export const previewSessionBindingSchema = z.object({
  role: z.enum(["primary", "dependency"]),
  label: z.string().min(1).max(80),
  targetPort: z.number().int().min(1).max(65_535),
  targetProtocol: z.enum(["http", "https"]),
  slotId: z.number().int().min(1).max(128),
  publicUrl: z.url(),
});

// Was die Laufzeit in dieser Session wirklich kann, und was sie ausdrücklich nicht
// kann. Beides wird in der Oberfläche angezeigt, statt Vollständigkeit zu behaupten.
export const previewCapabilitySchema = z.enum([
  "bridge",
  "diagnostics",
  "storage-snapshot",
  "slot-reset",
  "websocket",
  "event-source",
]);

export const previewLimitationSchema = z.enum([
  "cookies-share-host",
  "no-indexeddb-sync",
  "no-service-worker-sync",
  "no-session-storage-sync",
  "approximate-device-metrics",
  "bridge-unavailable",
  "partial-network-visibility",
]);

export const previewSessionResponseSchema = z.object({
  id: z.string().uuid(),
  sessionKey: z.string().min(1),
  projectId: z.string().nullable(),
  primaryPort: z.number().int().min(1).max(65_535),
  bindings: z.array(previewSessionBindingSchema).min(1).max(12),
  leaseExpiresAt: isoDateSchema,
  routingRevision: z.number().int().nonnegative().default(0),
  bridgeVersion: z.string().min(1).default("v1"),
  capabilities: z.array(previewCapabilitySchema).max(16).default([]),
  limitations: z.array(previewLimitationSchema).max(16).default([]),
  storageProfileId: z.string().uuid().nullable().default(null),
  slotGeneration: z.number().int().nonnegative().default(0),
});

export const previewSlotAssignmentRequestSchema = z.object({
  slotId: z.number().int().min(1).max(128).nullable().optional(),
  targetPort: z.number().int().min(1).max(65_535).nullable(),
  expectedTargetPort: z.number().int().min(1).max(65_535).optional(),
  isolate: z.boolean().default(true),
}).superRefine((input, context) => {
  if (input.targetPort === null && input.slotId == null) {
    context.addIssue({ code: "custom", message: "Zum Freigeben muss ein Preview-Slot angegeben werden." });
  }
  if (input.targetPort !== null && input.expectedTargetPort !== undefined) {
    context.addIssue({ code: "custom", message: "Der erwartete Zielport ist nur beim Freigeben erlaubt." });
  }
});

// ── Gerätepräferenz ────────────────────────────────────────────────────────────
// Die Benutzeridentität kommt aus dem vertrauenswürdigen Tailscale-Header und wird
// bewusst nicht vom Client übertragen.
export const previewDevicePreferenceSchema = z.object({
  deviceId: z.string().trim().min(1).max(80),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  updatedAt: isoDateSchema.nullable().default(null),
});

export const previewDevicePreferenceRequestSchema = previewDevicePreferenceSchema.pick({
  deviceId: true,
  orientation: true,
});

export const previewHubPreferenceSchema = z.object({
  externalOpenMode: previewExternalOpenModeSchema.default("tab"),
  updatedAt: isoDateSchema.nullable(),
});

export const previewHubPreferenceRequestSchema = previewHubPreferenceSchema.pick({ externalOpenMode: true });

export const previewRuntimeLaunchSchema = z.object({
  status: previewDevServerStatusSchema,
  url: z.url(),
  sessionId: z.string().uuid(),
});

// ── Slot-Reset ─────────────────────────────────────────────────────────────────
export const previewSlotResetRequestSchema = z.object({
  expectedGeneration: z.number().int().nonnegative(),
  storageProfileId: z.string().uuid().nullable(),
});

export const previewSlotResetResponseSchema = z.object({
  slotId: z.number().int().min(1).max(128),
  nonce: z.string().min(16).max(120),
  state: previewSlotStateSchema,
  slotGeneration: z.number().int().nonnegative(),
  resetUrl: z.url(),
  expiresAt: isoDateSchema,
});

export const previewSlotResetReportSchema = z.object({
  nonce: z.string().min(16).max(120),
  // Die Workbench meldet, was die Bridge nach dem Löschen noch gefunden hat.
  serviceWorkers: z.number().int().nonnegative().max(1_000),
  cacheStorages: z.number().int().nonnegative().max(1_000),
  localStorageKeys: z.number().int().nonnegative().max(100_000),
  sessionStorageKeys: z.number().int().nonnegative().max(100_000),
  indexedDatabases: z.number().int().nonnegative().max(1_000),
  // `false`, wenn der Browser keine Inventur erlaubt (z. B. indexedDB.databases fehlt).
  verifiable: z.boolean(),
});

export const previewSlotResetVerificationResponseSchema = z.object({
  slotId: z.number().int().min(1).max(128),
  state: previewSlotStateSchema,
  slotGeneration: z.number().int().nonnegative(),
  verifiedAt: isoDateSchema.nullable(),
  message: z.string().min(1).max(400),
});

export type PreviewSlot = z.infer<typeof previewSlotSchema>;

export type PreviewSlotsResponse = z.infer<typeof previewSlotsResponseSchema>;

export type PreviewSlotAssignmentRequest = z.infer<typeof previewSlotAssignmentRequestSchema>;

export type PreviewDependency = z.infer<typeof previewDependencySchema>;

export type PreviewDependenciesResponse = z.infer<typeof previewDependenciesResponseSchema>;

export type PreviewSessionRequest = z.infer<typeof previewSessionRequestSchema>;

export type PreviewSessionBinding = z.infer<typeof previewSessionBindingSchema>;

export type PreviewSessionResponse = z.infer<typeof previewSessionResponseSchema>;

export type PreviewSlotState = z.infer<typeof previewSlotStateSchema>;

export type PreviewAffinityStatus = z.infer<typeof previewAffinityStatusSchema>;

export type PreviewCapability = z.infer<typeof previewCapabilitySchema>;

export type PreviewLimitation = z.infer<typeof previewLimitationSchema>;

export type PreviewDevicePreference = z.infer<typeof previewDevicePreferenceSchema>;

export type PreviewDevicePreferenceRequest = z.infer<typeof previewDevicePreferenceRequestSchema>;

export type PreviewRuntimeLaunch = z.infer<typeof previewRuntimeLaunchSchema>;

export type PreviewHubPreference = z.infer<typeof previewHubPreferenceSchema>;

export type PreviewHubPreferenceRequest = z.infer<typeof previewHubPreferenceRequestSchema>;

export type PreviewSlotResetRequest = z.infer<typeof previewSlotResetRequestSchema>;

export type PreviewSlotResetResponse = z.infer<typeof previewSlotResetResponseSchema>;

export type PreviewSlotResetReport = z.infer<typeof previewSlotResetReportSchema>;

export type PreviewSlotResetVerificationResponse = z.infer<typeof previewSlotResetVerificationResponseSchema>;
