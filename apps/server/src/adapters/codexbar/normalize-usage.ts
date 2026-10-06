import { createHash } from "node:crypto";
import type { AccountUsage, ProviderUsage, ResetCredit, UsageWindow } from "@wrapt/contracts";
import type { CodexbarPayload } from "./codexbar-schemas.js";

type WorkbenchProvider = "codex" | "opencode" | "claude";

const providerMetadata: Record<WorkbenchProvider, { name: string; codexbarProvider: string }> = {
  codex: { name: "Codex", codexbarProvider: "codex" },
  opencode: { name: "OpenCode Go", codexbarProvider: "opencodego" },
  claude: { name: "Claude Code", codexbarProvider: "claude" },
};

function accountId(provider: WorkbenchProvider, email: string | undefined, position: number): string {
  const source = email ?? `${provider}-${position}`;
  return `${provider}-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

function payloadIdentity(payload: CodexbarPayload, fallback: string): string {
  return (payload.usage?.accountEmail ?? payload.usage?.identity?.accountEmail ?? payload.account ?? fallback).toLowerCase();
}

function hasUsageWindow(payload: CodexbarPayload): boolean {
  return [payload.usage?.primary, payload.usage?.secondary, payload.usage?.tertiary]
    .some((window) => window?.usedPercent !== undefined);
}

/**
 * Ob ein Payload überhaupt verwertbare Daten trägt. Reset-Guthaben zählen
 * mit: Ein Konto, dessen Limitfenster gerade nicht abrufbar sind, aber über
 * gültige Guthaben verfügt, wäre sonst unsichtbar — und der Guthabenverlust
 * wäre weder in der Statusleiste noch auf der Nutzungsseite zu sehen.
 */
function hasReportableData(payload: CodexbarPayload): boolean {
  return hasUsageWindow(payload) || (payload.usage?.codexResetCredits?.credits.length ?? 0) > 0;
}

function windowsFor(payload: CodexbarPayload): UsageWindow[] {
  const usage = payload.usage;
  if (!usage) return [];
  return (["primary", "secondary", "tertiary"] as const).flatMap((id) => {
    const window = usage[id];
    if (!window || window.usedPercent === undefined) return [];
    return [{
      id,
      label: windowLabel(id, window.windowMinutes),
      usedPercent: window.usedPercent,
      remainingPercent: Math.max(0, 100 - window.usedPercent),
      windowMinutes: window.windowMinutes ?? null,
      resetsAt: window.resetsAt ?? null,
    }];
  });
}

function windowLabel(id: UsageWindow["id"], windowMinutes: number | undefined): string {
  if (windowMinutes === 300) return "5-Stunden-Limit";
  if (windowMinutes === 10_080) return "Wochenlimit";
  if (windowMinutes === 43_200) return "Monatslimit";
  if (id === "primary") return "Aktuelles Zeitfenster";
  if (id === "secondary") return "Längerer Zeitraum";
  return "Zusätzliches Zeitfenster";
}

/**
 * Banked Resets kommen nur von Codex (`codexResetCredits`). Die snakecase-Felder
 * des Anbieters werden hier auf die camelCase-Vertragsform gebracht; ein
 * fehlendes Guthaben ist ein leeres Array, kein Fehler.
 */
function resetCreditsFor(payload: CodexbarPayload): ResetCredit[] {
  const credits = payload.usage?.codexResetCredits;
  if (!credits) return [];
  return credits.credits.map((credit) => ({
    id: credit.id,
    title: credit.title,
    description: credit.description,
    status: credit.status,
    grantedAt: credit.granted_at ?? null,
    expiresAt: credit.expires_at ?? null,
  }));
}

function unavailableProvider(providerId: WorkbenchProvider, code: string, message: string): ProviderUsage {
  const metadata = providerMetadata[providerId];
  return {
    providerId,
    providerName: metadata.name,
    status: "unavailable",
    updatedAt: null,
    accounts: [],
    error: { code, message },
  };
}

export function unavailableUsage(providerId: WorkbenchProvider, code: string, message: string): ProviderUsage {
  return unavailableProvider(providerId, code, message);
}

export function disabledUsage(providerId: WorkbenchProvider): ProviderUsage {
  const metadata = providerMetadata[providerId];
  return {
    providerId,
    providerName: metadata.name,
    status: "disabled",
    updatedAt: null,
    accounts: [],
    error: { code: "MONITORING_DISABLED", message: "Die Limitüberwachung für diesen Anbieter ist in den Einstellungen deaktiviert." },
  };
}

export function normalizeProviderUsage(providerId: WorkbenchProvider, payloads: CodexbarPayload[]): ProviderUsage {
  const metadata = providerMetadata[providerId];
  const matching = payloads.filter((payload) => payload.provider === metadata.codexbarProvider);
  if (matching.length === 0) {
    return unavailableProvider(providerId, "PROVIDER_NOT_DETECTED", "Für diesen Anbieter sind keine Nutzungsdaten verfügbar.");
  }

  const successfulRaw = matching.filter(hasReportableData);
  const successfulByIdentity = new Map<string, CodexbarPayload>();
  successfulRaw.forEach((payload, index) => {
    const identity = payloadIdentity(payload, `position-${index}`);
    const existing = successfulByIdentity.get(identity);
    // Vorrang hat das Payload mit den meisten Fenstern; bei Gleichstand das
    // fehlerfreie. Guthaben allein zählen nicht als Füllgrad, sonst gewinnt ein
    // Fensterloses Payload mit Guthaben gegen eines mit echten Limitwerten.
    const populatedWindows = (candidate: CodexbarPayload) => [candidate.usage?.primary, candidate.usage?.secondary, candidate.usage?.tertiary]
      .filter((window) => window?.usedPercent !== undefined).length;
    if (!existing || populatedWindows(payload) > populatedWindows(existing) || (existing.error && !payload.error)) {
      successfulByIdentity.set(identity, payload);
    }
  });
  const successful = [...successfulByIdentity.values()];
  if (successful.length === 0) {
    return unavailableProvider(providerId, "PROVIDER_UNAVAILABLE", "Für diesen Anbieter konnten keine Nutzungsdaten geladen werden.");
  }

  const accounts: AccountUsage[] = successful.map((payload, index) => {
    const email = payload.usage?.accountEmail ?? payload.usage?.identity?.accountEmail ?? payload.account;
    const plan = payload.usage?.loginMethod ?? payload.usage?.identity?.loginMethod ?? null;
    return {
      id: accountId(providerId, email, index),
      label: successful.length === 1 ? "Account" : `Account ${index + 1}`,
      email: email ?? null,
      plan,
      windows: windowsFor(payload),
      resetCredits: resetCreditsFor(payload),
    };
  });
  const updatedAt = successful
    .map((payload) => payload.usage?.updatedAt ?? null)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
  const unresolvedFailures = matching.some((payload, index) => {
    if (hasReportableData(payload)) return false;
    const identity = payloadIdentity(payload, `unresolved-${index}`);
    return !successfulByIdentity.has(identity);
  });
  const isPartial = accounts.some((account) => account.windows.length === 0) || unresolvedFailures;

  return {
    providerId,
    providerName: metadata.name,
    status: isPartial ? "partial" : "available",
    updatedAt,
    accounts,
    error: isPartial ? { code: "PARTIAL_DATA", message: "Ein Teil der Nutzungsdaten ist nicht verfügbar." } : null,
  };
}
