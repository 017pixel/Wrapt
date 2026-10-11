import { z } from "zod";

const isoDateSchema = z.iso.datetime({ offset: true });

// Update prüft den Git-Stand gegen origin und zieht bei Bedarf die neueste Version.
// Der eigentliche Ablauf (fetch, pull, install, build, restart) läuft im Hintergrund
// über dieselbe Statusdatei wie der Neustart, damit das UI den Fortschritt pollt.
export const updateStatusResponseSchema = z.object({
  branch: z.string().min(1),
  version: z.string().min(1),
  localHash: z.string().nullable(),
  localShort: z.string().nullable(),
  remoteHash: z.string().nullable(),
  remoteShort: z.string().nullable(),
  updateAvailable: z.boolean(),
  dirty: z.boolean(),
  dirtyFiles: z.array(z.string().max(300)).max(30).default([]),
  dirtyCount: z.number().int().nonnegative().default(0),
  checkedAt: isoDateSchema,
  message: z.string(),
});

export const updateTriggerResponseSchema = z.object({
  status: z.literal("accepted"),
  jobId: z.string().uuid(),
  target: z.literal("both"),
  bootId: z.string().min(1),
  webBuildId: z.number().int().nullable(),
  logFile: z.string().min(1),
  fromHash: z.string().nullable(),
  toHash: z.string().nullable(),
});

export type UpdateStatusResponse = z.infer<typeof updateStatusResponseSchema>;
export type UpdateTriggerResponse = z.infer<typeof updateTriggerResponseSchema>;

// Neustart und Update teilen sich Job-Modell und Statusdatei (D-015): Der Client sendet
// optional x-idempotency-key (gleicher Key → gleiche jobId) und erkennt den Abschluss
// an bootIdChanged/webBuildIdChanged statt eigenem Marker-Vergleich.
export const restartTargetSchema = z.enum(["frontend", "backend", "both"]);
export const restartRequestSchema = z.object({ target: restartTargetSchema });
export const restartResponseSchema = z.object({
  status: z.literal("accepted"),
  jobId: z.string().uuid(),
  target: restartTargetSchema,
  // Basiswerte zum Zeitpunkt des Auslösens, damit der Client den Abschluss erkennen kann.
  bootId: z.string().min(1),
  webBuildId: z.number().int().nullable(),
  logFile: z.string().min(1),
});

export const restartPhaseSchema = z.enum(["idle", "running", "succeeded", "failed"]);
// Fortschritt des letzten Neustarts. Das Skript schreibt den Zustand nach
// data/restart-logs/last-status.json; das UI pollt ihn und zeigt bei Fehlern
// direkt den Build-Ausschnitt statt nur „Zeitüberschreitung".
export const restartStatusResponseSchema = z.object({
  jobId: z.string().uuid().nullable(),
  phase: restartPhaseSchema,
  target: restartTargetSchema.nullable(),
  exitCode: z.number().int().nullable(),
  // Der zuletzt begonnene Schritt, z. B. "Baue Frontend (@wrapt/web) …".
  step: z.string(),
  message: z.string(),
  startedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  // Ende des Build-Logs, ANSI-bereinigt — das ist die eigentliche Fehlermeldung.
  logTail: z.string(),
  logFile: z.string().nullable(),
  bootId: z.string().min(1),
  webBuildId: z.number().int().nullable(),
  // Abwärtskompatibel ergänzt: true, sobald sich der Marker seit Job-Start geändert hat;
  // null, wenn die Basis unbekannt ist (alte Statusdatei). Alte Clients ignorieren
  // unbekannte Schlüssel, daher bleibt das Format lesbar.
  bootIdChanged: z.boolean().nullable(),
  webBuildIdChanged: z.boolean().nullable(),
  baselineBootId: z.string().nullable(),
  baselineWebBuildId: z.number().int().nullable(),
});

export type RestartTarget = z.infer<typeof restartTargetSchema>;
export type RestartRequest = z.infer<typeof restartRequestSchema>;
export type RestartResponse = z.infer<typeof restartResponseSchema>;
export type RestartPhase = z.infer<typeof restartPhaseSchema>;
export type RestartStatusResponse = z.infer<typeof restartStatusResponseSchema>;
