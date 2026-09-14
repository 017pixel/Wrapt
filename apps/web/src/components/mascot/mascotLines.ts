/**
 * Sprüche und Stimmungen des Capybara-Maskottchens. Die Auswahl ist bewusst
 * als reine Funktion gebaut, damit sie ohne DOM getestet werden kann.
 */
export interface MascotContext {
  readonly offline: boolean;
  readonly lowLimit: { readonly provider: string; readonly percent: number } | null;
  readonly busy: boolean;
}

export type MascotMood = "sleep" | "worry" | "work" | "calm";

export const LOW_LIMIT_THRESHOLD = 15;

export interface MascotUsageProvider {
  readonly providerName: string;
  readonly status: string;
  readonly accounts: readonly {
    readonly windows: readonly {
      readonly remainingPercent: number;
      readonly windowMinutes: number | null;
    }[];
  }[];
}

const RELEVANT_WINDOW_MINUTES = new Set([300, 10_080, 43_200]);

/** Findet das knappste Limit über alle überwachten Anbieter und Accounts. */
export function mascotLowestLimit(
  providers: readonly MascotUsageProvider[],
): MascotContext["lowLimit"] {
  let lowest: MascotContext["lowLimit"] = null;
  for (const provider of providers) {
    if (provider.status === "disabled") continue;
    for (const account of provider.accounts) {
      for (const window of account.windows) {
        if (window.windowMinutes === null || !RELEVANT_WINDOW_MINUTES.has(window.windowMinutes)) continue;
        const percent = Math.round(window.remainingPercent);
        if (lowest === null || percent < lowest.percent) {
          lowest = { provider: provider.providerName, percent };
        }
      }
    }
  }
  return lowest;
}

export function mascotContextFrom(
  providers: readonly MascotUsageProvider[],
  offline: boolean,
  busy: boolean,
): MascotContext {
  const lowest = mascotLowestLimit(providers);
  return {
    offline,
    lowLimit: lowest !== null && lowest.percent <= LOW_LIMIT_THRESHOLD ? lowest : null,
    busy,
  };
}

export function mascotMood(context: MascotContext): MascotMood {
  if (context.offline) return "sleep";
  if (context.lowLimit !== null) return "worry";
  if (context.busy) return "work";
  return "calm";
}

const GENERIC_LINES = [
  "Hallooo!",
  "Nur nicht stressen.",
  "Läuft bei mir. Und bei dir?",
  "Ich bin dann mal halb im Wasser.",
  "Alles entspannt.",
  "Kurz die Ohren gelüftet.",
  "Weiter, weiter. Ich bin wach.",
  "Schön ruhig hier unten.",
];

export function mascotLinesFor(context: MascotContext): readonly string[] {
  if (context.offline) {
    return [
      "Kein Netz. Ich halte Wache.",
      "Offline? Dann dösen wir gemeinsam.",
    ];
  }
  if (context.lowLimit !== null) {
    const { provider, percent } = context.lowLimit;
    return [
      `Oh, nur noch ${percent}% ${provider} übrig.`,
      `${provider} bei ${percent}%. Ich hätte da eine Badewanne.`,
      `${provider} wird knapp. Zeit für eine Pause.`,
    ];
  }
  if (context.busy) {
    return [
      "Ich halte ein Auge auf die Arbeitsfläche.",
      "Fast alles gespeichert. Fast.",
      "Nicht vergessen zu speichern.",
    ];
  }
  return [];
}

/**
 * Wählt einen Spruch: bei knappem Kontext wird er bevorzugt, sonst bleibt es
 * generisch. Derselbe Spruch wiederholt sich nie direkt hintereinander.
 */
export function selectMascotLine(
  context: MascotContext,
  random: () => number,
  previous?: string,
): string {
  const contextual = mascotLinesFor(context);
  const pool = contextual.length > 0 && random() < 0.6 ? contextual : GENERIC_LINES;
  const candidates = pool.filter((line) => line !== previous);
  const usable = candidates.length > 0 ? candidates : pool;
  const index = Math.min(usable.length - 1, Math.floor(random() * usable.length));
  return usable[index] ?? GENERIC_LINES[0]!;
}
