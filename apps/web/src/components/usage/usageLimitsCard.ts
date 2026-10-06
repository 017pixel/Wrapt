import type { ProviderUsage, ResetCredit, UsageWindow } from "@wrapt/contracts";

/**
 * Reine View-Logik für die Limit-Hover-Card der Statusleiste. Aus den
 * Provider-Daten des Vertrags entsteht genau das, was die Karte zeigt:
 * Fenster mit Label, Auslastung, Zustand und Reset-Countdown sowie — sofern
 * der Anbieter sie liefert — Banked Resets.
 *
 * Bewusste Grenze: Es wird nichts errechnet, was nicht geliefert wurde. Ein
 * unbekanntes Zeitfenster wird aus `windowMinutes` abgeleitet statt verworfen,
 * ein fehlender Reset-Zeitpunkt bleibt leer statt einen Platzhalter zu zeigen.
 */

/** Die drei bekannten Vertrags-Label auf die Kurzform der Karte abbilden. */
const shortLabels: Record<string, string> = {
  "5-Stunden-Limit": "5 Stunden",
  Wochenlimit: "7 Tage",
  Monatslimit: "30 Tage",
};

const expiryFormatter = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;
const DAY_MINUTES = MINUTES_PER_HOUR * HOURS_PER_DAY;
const MONTH_MINUTES = DAY_MINUTES * DAYS_PER_MONTH;

/**
 * Kürzestes möglichst lesbares Label für ein Zeitfenster. Bekannte
 * Vertrags-Label werden übersetzt, alles andere aus der Fensterlänge abgeleitet,
 * damit ein Anbieter mit unbekanntem Zeitraum nicht als „n % frei" endet.
 *
 * Es wird nur in eine größere Einheit umgerechnet, wenn die Länge darin glatt
 * aufgeht: 43.199 Minuten sind keine „29.999 Tage", sondern bleiben exakt in
 * Minuten. Ein gerundetes Zeitfenster würde eine Genauigkeit vortäuschen, die
 * der Anbieter nicht gemeldet hat.
 */
export function windowCardLabel(window: UsageWindow): string {
  const known = Object.hasOwn(shortLabels, window.label) ? shortLabels[window.label] : undefined;
  if (known) return known;
  const minutes = window.windowMinutes;
  if (minutes === null || minutes <= 0) return window.label;

  const units: Array<{ size: number; one: string; many: string }> = [
    { size: MONTH_MINUTES, one: "Monat", many: "Monate" },
    { size: DAY_MINUTES, one: "Tag", many: "Tage" },
    { size: MINUTES_PER_HOUR, one: "Stunde", many: "Stunden" },
  ];
  for (const unit of units) {
    if (minutes >= unit.size && minutes % unit.size === 0) {
      const value = minutes / unit.size;
      return value === 1 ? `1 ${unit.one}` : `${value} ${unit.many}`;
    }
  }
  return `${minutes} Min`;
}

/**
 * Dringlichkeitsstufe nach dem **verbleibenden** Anteil: viel übrig ist gut,
 * wenig übrig ist kritisch. Die Karte zeigt durchgehend das Übrige, deshalb
 * dreht sich auch die Skala hierher — sonst wäre ein voller Balken gefährlich
 * und ein leerer harmlos, also genau verkehrt herum.
 */
export type WindowLevel = "ok" | "warn" | "bad";

export function windowLevel(remainingPercent: number): WindowLevel {
  if (remainingPercent <= 20) return "bad";
  if (remainingPercent < 50) return "warn";
  return "ok";
}

/**
 * Zeit bis zum Reset als „in 2 Std 14 Min" beziehungsweise „in 4 Tagen".
 * Ab drei Tagen bleibt nur die Tagesangabe — die Stunde ist dort für die
 * Planung ohne Bedeutung und würde die Zeile unnötig breit machen.
 * Vergangene Zeitpunkte liefern `null`.
 */
export function resetCountdown(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at) || at <= now) return null;
  const minutes = Math.floor((at - now) / 60_000);
  if (minutes < 1) return "jetzt";
  if (minutes < MINUTES_PER_HOUR) return `in ${minutes} Min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const restMinutes = minutes % MINUTES_PER_HOUR;
  if (hours < HOURS_PER_DAY) return restMinutes > 0 ? `in ${hours} Std ${restMinutes} Min` : `in ${hours} Std`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days >= 3) return `in ${days} Tagen`;
  const dayLabel = days === 1 ? "1 Tag" : `${days} Tagen`;
  const restHours = hours % HOURS_PER_DAY;
  return restHours > 0 ? `in ${dayLabel} ${restHours} Std` : `in ${dayLabel}`;
}

/**
 * Das früheste Ablaufdatum als Epoch-Wert. Nach `Date.parse()` sortieren, nicht
 * als String: Die Vertragsform erlaubt Zeitzonenoffsets, und lexikografisch
 * sortierte ISO-Strings wählen bei gemischten Offsets das falsche Datum.
 */
function earliestExpiry(credits: ResetCredit[]): string | null {
  const soonest = credits.reduce<{ at: number; raw: string } | null>((best, credit) => {
    const at = Date.parse(credit.expiresAt ?? "");
    if (!Number.isFinite(at)) return best;
    if (!best || at < best.at) return { at, raw: credit.expiresAt ?? "" };
    return best;
  }, null);
  return soonest?.raw ?? null;
}

/** Ablaufdatum als „20. Aug."; ohne Datum bleibt der Text leer. */
function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  return expiryFormatter.format(new Date(at));
}

export interface LimitsCardWindow {
  key: string;
  label: string;
  /** Verbleibender Anteil in Prozent — die Zahl, die die Karte zeigt. */
  remainingPercent: number;
  level: WindowLevel;
  resetsIn: string | null;
}

export interface LimitsCardCredits {
  count: number;
  expiresOn: string | null;
}

/** Akzent eines Providers; `neutral` steht für unvollständige oder inaktive Daten. */
export type ProviderTone = "info" | "warn" | "ok" | "neutral";

const providerTones: Record<ProviderUsage["providerId"], ProviderTone> = {
  codex: "info",
  claude: "warn",
  opencode: "ok",
};

export interface LimitsCardAccount {
  id: string;
  identity: string;
  plan: string | null;
  windows: LimitsCardWindow[];
  credits: LimitsCardCredits | null;
}

export interface LimitsCardProvider {
  providerId: ProviderUsage["providerId"];
  name: string;
  tone: ProviderTone;
  accounts: LimitsCardAccount[];
  /** Neutrale Zeile für Zustände ohne Fenster — nie ein erfundener Prozentwert. */
  note: string | null;
}

/**
 * Nur tatsächlich einlösbare Guthaben zählen. Ein verbrauchter Credit ist für
 * die Statusleiste genauso irrelevant wie ein abgelaufener — CodexBar meldet
 * abgelaufene Einträge teils weiterhin mit `status: available`, deshalb wird
 * zusätzlich das Ablaufdatum geprüft. Ein fehlendes Ablaufdatum gilt als
 * unbefristet und bleibt sichtbar.
 */
function creditsFor(account: ProviderUsage["accounts"][number], now: number): LimitsCardCredits | null {
  const available = (account.resetCredits ?? []).filter((credit) => {
    if (credit.status !== "available") return false;
    if (!credit.expiresAt) return true;
    const expiry = Date.parse(credit.expiresAt);
    return !Number.isFinite(expiry) || expiry > now;
  });
  if (available.length === 0) return null;
  return { count: available.length, expiresOn: formatExpiry(earliestExpiry(available)) };
}

/**
 * Neutrale Zeile für Zustände ohne verwertbare Fenster — nie ein erfundener
 * Prozentwert. `null` bedeutet: der Provider liefert Fenster und braucht keine
 * Erklärung.
 */
function providerNote(provider: ProviderUsage): string | null {
  if (provider.status === "disabled") return "Überwachung in den Einstellungen aus";
  if (provider.status === "unavailable") return "Keine Nutzungsdaten verfügbar";
  if (provider.status === "partial") return "Teilweise Daten — nicht alle Konten lesbar";
  if (provider.accounts.every((account) => account.windows.length === 0)) return "Keine Limitfenster gemeldet";
  return null;
}

export function limitsCardWindow(window: UsageWindow, now: number): LimitsCardWindow {
  return {
    key: window.id,
    label: windowCardLabel(window),
    remainingPercent: window.remainingPercent,
    level: windowLevel(window.remainingPercent),
    resetsIn: resetCountdown(window.resetsAt, now),
  };
}

/**
 * Ein Provider-Block der Karte. Jeder Account behält alle gelieferten Fenster —
 * ein Account ohne 5-Stunden-Fenster zeigt eben nur seine längeren Zeiträume.
 */
export function limitsCardProvider(provider: ProviderUsage, now: number): LimitsCardProvider {
  const note = providerNote(provider);
  return {
    providerId: provider.providerId,
    name: provider.providerName,
    // Nur ein Provider mit verwertbaren Daten trägt seinen Akzent. `partial`,
    // `unavailable` und `disabled` sind Einschränkungen, keine Ampel — dort
    // wäre eine Providerfarbe eine falsche Aussage.
    tone: note === null ? providerTones[provider.providerId] : "neutral",
    note,
    accounts: provider.accounts.map((account) => ({
      id: account.id,
      identity: account.email ?? account.label,
      plan: account.plan,
      windows: account.windows.map((window) => limitsCardWindow(window, now)),
      credits: creditsFor(account, now),
    })),
  };
}

export function limitsCardProviders(
  providers: readonly ProviderUsage[],
  definitions: readonly { providerId: ProviderUsage["providerId"]; title: string }[],
  now: number,
): LimitsCardProvider[] {
  return definitions.flatMap((definition) => {
    const provider = providers.find((candidate) => candidate.providerId === definition.providerId);
    if (!provider) return [];
    // `title` ist die sprechendere Registry-Bezeichnung; sie gewinnt gegen den
    // technischen Namen aus dem Adapter, der für Nutzerinnen sichtbar ist.
    return [{ ...limitsCardProvider(provider, now), name: definition.title }];
  });
}