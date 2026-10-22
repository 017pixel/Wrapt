import { z } from "zod";

/**
 * Client-Einstellungen, die zentral auf dem Server liegen und zwischen allen
 * Clients abgeglichen werden. Die Schlüssel sind bewusst fachlich benannt und
 * nicht an einen localStorage-Namen gebunden: Der Client darf sein
 * Speicherformat versionieren, ohne dass der Server es kennen muss.
 *
 * Nicht enthalten sind gerätegebundene Daten (Push-Abos, PWA-Hinweise) und
 * flüchtige Sitzungszustände (Entwürfe, offene Preview-Sitzungen).
 */
export const uiSettingsKeys = [
  "appPreferences",
  "sidebarPreferences",
  "dashboardPreferences",
  "layout",
  "usagePreferences",
  "overlayTransparency",
] as const;

export const uiSettingKeySchema = z.enum(uiSettingsKeys);
export type UiSettingKey = z.infer<typeof uiSettingKeySchema>;

/**
 * Ein Wert ist das vollständige, bereits serialisierte Client-Dokument
 * (bei Zustand-Stores inklusive `{ state, version }`). Der Server prüft nur
 * JSON-Verträglichkeit und Größe, nicht die fachlichen Felder — deren
 * Migration bleibt in der jeweiligen Client-Version.
 */
export const uiSettingValueSchema = z.json();
export type UiSettingValue = z.infer<typeof uiSettingValueSchema>;

export const uiSettingEntrySchema = z.object({
  value: uiSettingValueSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});
export type UiSettingEntry = z.infer<typeof uiSettingEntrySchema>;

export const uiSettingsDocumentSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  entries: z.partialRecord(uiSettingKeySchema, uiSettingEntrySchema),
});
export type UiSettingsDocument = z.infer<typeof uiSettingsDocumentSchema>;

export const saveUiSettingsRequestSchema = z.object({
  /** Zufällige Kennung des schreibenden Browser-Tabs, damit der eigene
   *  Broadcast nicht erneut angewendet wird. */
  clientId: z.string().trim().min(1).max(100),
  changes: z.array(z.object({
    key: uiSettingKeySchema,
    value: uiSettingValueSchema,
  })).min(1).max(uiSettingsKeys.length),
});
export type SaveUiSettingsRequest = z.infer<typeof saveUiSettingsRequestSchema>;

export const uiSettingsUpdatedEventSchema = z.object({
  type: z.literal("ui-settings.updated"),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  clientId: z.string().min(1).max(100),
  entries: z.partialRecord(uiSettingKeySchema, uiSettingEntrySchema),
});
export type UiSettingsUpdatedEvent = z.infer<typeof uiSettingsUpdatedEventSchema>;

/**
 * Serverweite Einstellungen, die weiterhin in `config/wrapt.local.json`
 * liegen. Ändert ein Client einen Wert, lesen die übrigen Clients die
 * betroffene React-Query neu.
 */
export const sharedConfigSettingKeys = [
  "appearance",
  "contextMenu",
  "mascot",
  "notificationPreferences",
  "t3Channel",
  "usageMonitoring",
  "codexResetHistory",
] as const;

export const sharedConfigSettingKeySchema = z.enum(sharedConfigSettingKeys);
export type SharedConfigSettingKey = z.infer<typeof sharedConfigSettingKeySchema>;

export const sharedConfigChangedEventSchema = z.object({
  type: z.literal("settings.config-changed"),
  keys: z.array(sharedConfigSettingKeySchema).min(1),
});
export type SharedConfigChangedEvent = z.infer<typeof sharedConfigChangedEventSchema>;

export const settingsSocketSyncEventSchema = z.object({
  type: z.literal("settings.sync"),
});

export const settingsSocketEventSchema = z.discriminatedUnion("type", [
  uiSettingsUpdatedEventSchema,
  sharedConfigChangedEventSchema,
  settingsSocketSyncEventSchema,
]);
export type SettingsSocketEvent = z.infer<typeof settingsSocketEventSchema>;

/** Server-seitige Obergrenzen; die Summe bleibt bewusst deutlich unter dem
 *  allgemeinen Request-Limit, damit ein defekter Client keinen Speicher füllt. */
export const UI_SETTINGS_LIMITS = {
  maxValueBytes: 128 * 1024,
  maxDocumentBytes: 512 * 1024,
} as const;
