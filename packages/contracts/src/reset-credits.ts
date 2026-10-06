import { z } from "zod";

/**
 * Reset-Guthaben sind beim Anbieter hinterlegte, einlösbare Resets eines
 * Limitfensters. Nur Codex liefert sie; bei OpenCode und Claude bleibt die
 * Liste leer und die Oberfläche zeigt die Zeile nicht.
 *
 * Das eigene `isoDateSchema` folgt dem Muster der übrigen Schemadateien in
 * diesem Package und hält das Modul frei von einem Import-Zyklus über index.ts.
 */
const isoDateSchema = z.iso.datetime({ offset: true });

export const resetCreditSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: z.string().min(1),
  grantedAt: isoDateSchema.nullable(),
  expiresAt: isoDateSchema.nullable(),
});

export type ResetCredit = z.infer<typeof resetCreditSchema>;
