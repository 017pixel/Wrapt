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
