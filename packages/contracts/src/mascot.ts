import { z } from "zod";

/**
 * Easter-Egg-Einstellungen der Workbench. Aktuell lebt das Capybara-Maskottchen
 * nur in der Statusleiste; der Aufbau bleibt bewusst offen, damit weitere
 * Schalter und spätere Ablageorte ohne Formatwechsel ergänzt werden können.
 */
export const mascotConfigSchema = z.object({
  enabled: z.boolean().default(true),
}).prefault({});

export const mascotConfigResponseSchema = z.object({
  mascot: mascotConfigSchema,
});

export const defaultMascotConfig = mascotConfigSchema.parse({});

export type MascotConfig = z.infer<typeof mascotConfigSchema>;
export type MascotConfigResponse = z.infer<typeof mascotConfigResponseSchema>;
