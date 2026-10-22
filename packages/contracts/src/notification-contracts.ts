import { z } from "zod";
import { pushEndpointSchema } from "./push.js";
import { isoDateSchema } from "./host-system.js";

export const notificationCategorySchema = z.enum(["hermes", "coding-agent", "terminal"]);

export const notificationSourceIconSchema = z.enum(["t3", "hermes", "opencode", "codex", "claude", "terminal", "wrapt", "workbench"]);

// `workbench` bleibt als Lesekompatibilität für alte SQLite-Zeilen erhalten;
// neue Produktmeldungen verwenden ausschließlich `wrapt`.
export const notificationSourceSchema = z.enum(["hermes", "t3", "opencode", "codex", "claude", "terminal", "wrapt", "workbench", "update"]);

export const notificationSeveritySchema = z.enum(["info", "success", "warning", "error"]);

export const notificationStateSchema = z.enum(["active", "resolved", "dismissed"]);

export const notificationReportSchema = z.object({
  message: z.string().min(1).max(4_000),
  stack: z.string().max(20_000).nullable().default(null),
  context: z.record(z.string(), z.string().max(2_000)).default({}),
  logs: z.array(z.string().max(2_000)).max(100).default([]),
  environment: z.record(z.string(), z.string().max(2_000)).default({}),
});

export const notificationSchema = z.object({
  id: z.uuid(), source: notificationSourceSchema, kind: z.string().min(1).max(64), severity: notificationSeveritySchema,
  category: notificationCategorySchema, sourceIcon: notificationSourceIconSchema, state: notificationStateSchema,
  title: z.string().min(1).max(200), body: z.string().max(1_000), link: z.string().startsWith("/").max(512).nullable(),
  remoteId: z.string().max(200).nullable(), createdAt: isoDateSchema, readAt: isoDateSchema.nullable(), acknowledgedAt: isoDateSchema.nullable(),
  deletedAt: isoDateSchema.nullable(), resolvedAt: isoDateSchema.nullable(),
  meta: z.record(z.string(), z.unknown()), report: notificationReportSchema.nullable(),
});

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema), unreadCount: z.number().int().nonnegative(),
  unacknowledgedErrorCount: z.number().int().nonnegative(), nextCursor: z.string().nullable(),
});

export const notificationPatchSchema = z.object({ read: z.boolean().optional(), acknowledged: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);

export const notificationPresenceItemSchema = z.object({
  source: notificationSourceSchema,
  threadId: z.string().max(200).nullish(),
  sessionId: z.string().max(200).nullish(),
});

// Mehrere gleichzeitig sichtbare Chat-Ansichten (aktive Route plus offene
// Panels). Nur Einträge mit Referenz (threadId/sessionId) gelten als gelesen
// und unterdrücken Push während der passenden Ansicht.
export const notificationPresenceSchema = z.array(notificationPresenceItemSchema).max(32);

// Der Server akzeptiert weiterhin die frühere Einzel-Form, damit alte Browser
// die Presence ohne Neuladen melden können.
export const notificationPresenceInputSchema = z.union([notificationPresenceSchema, notificationPresenceItemSchema]).nullable();

export const notificationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notification.created"), notification: notificationSchema }),
  z.object({ type: z.literal("notification.updated"), notification: notificationSchema }),
  z.object({ type: z.literal("notification.removed"), id: z.uuid() }),
  z.object({ type: z.literal("notification.sync") }),
]);

export const notificationSourcePreferencesSchema = z.object({ push: z.boolean().default(false) });

export const notificationPreferencesSchema = z.object({
  pushEnabled: z.boolean().default(false),
  sources: z.object({
    hermes: notificationSourcePreferencesSchema.prefault({ push: false }),
    t3: notificationSourcePreferencesSchema.prefault({ push: true }),
    opencode: notificationSourcePreferencesSchema.prefault({ push: false }),
    codex: notificationSourcePreferencesSchema.prefault({ push: false }),
    claude: notificationSourcePreferencesSchema.prefault({ push: false }),
    terminal: notificationSourcePreferencesSchema.prefault({ push: false }),
    wrapt: notificationSourcePreferencesSchema.prefault({ push: true }),
    // Legacy-Schlüssel: wird nicht mehr geschrieben, hält aber alte Präferenzen lesbar.
    workbench: notificationSourcePreferencesSchema.prefault({ push: true }),
    update: notificationSourcePreferencesSchema.prefault({ push: false }),
  }).prefault({}),
});

export const notificationSettingsResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
  pushSupported: z.boolean(),
  vapidPublicKey: z.string().nullable(),
  subscriptionCount: z.number().int().nonnegative(),
  serverPushEnabled: z.boolean(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});

export const pushSubscriptionRegistrationSchema = pushSubscriptionSchema.extend({
  deviceName: z.string().trim().min(1).max(80).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  userAgent: z.string().trim().min(1).max(512).optional(),
});

export const pushEndpointRequestSchema = z.object({ endpoint: pushEndpointSchema });

export const pushSubscriptionResponseSchema = z.object({
  registered: z.literal(true),
  subscriptionCount: z.number().int().positive(),
});

export const pushTestResponseSchema = z.object({ sent: z.literal(true) });

export const notificationPushPayloadSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(1_000),
  link: z.string().startsWith("/").max(512),
  source: notificationSourceSchema,
  severity: notificationSeveritySchema,
  createdAt: isoDateSchema,
});

export type NotificationSource = z.infer<typeof notificationSourceSchema>;

export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

export type NotificationSourceIcon = z.infer<typeof notificationSourceIconSchema>;

export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;

export type NotificationState = z.infer<typeof notificationStateSchema>;

export type NotificationReport = z.infer<typeof notificationReportSchema>;

export type Notification = z.infer<typeof notificationSchema>;

export type NotificationPatch = z.infer<typeof notificationPatchSchema>;

export type NotificationPresenceItem = z.infer<typeof notificationPresenceItemSchema>;

export type NotificationPresence = z.infer<typeof notificationPresenceSchema>;

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export type NotificationSettingsResponse = z.infer<typeof notificationSettingsResponseSchema>;

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

export type PushSubscriptionRegistration = z.infer<typeof pushSubscriptionRegistrationSchema>;

export type PushSubscriptionResponse = z.infer<typeof pushSubscriptionResponseSchema>;

export type PushTestResponse = z.infer<typeof pushTestResponseSchema>;

export type NotificationPushPayload = z.infer<typeof notificationPushPayloadSchema>;
