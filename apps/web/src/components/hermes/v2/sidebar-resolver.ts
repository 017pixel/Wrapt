import type { HermesV2Activity, HermesV2Session } from "@wrapt/contracts/hermes-v2";
import type { SidebarOrganization, SidebarRowView, SidebarShelf } from "./sidebar-types";

/** Eingabe nötig zuerst, Erledigt zuletzt. */
export const sidebarOrder: readonly SidebarShelf[] = ["needs-input", "active", "working", "pinned", "snoozed", "settled"];

/**
 * Lokaler Beleg aus dem Chat-Store: der Client weiß, dass die Sitzung läuft
 * (Turn, Tool-Aufruf oder offene Anfrage), auch wenn der Server in diesem
 * Moment "idle" meldet.
 */
export interface LocalActivity {
  running: boolean;
}

interface ShelfFacts {
  /** Der Agent wartet wirklich auf eine Eingabe. */
  waiting: boolean;
  /** Der lokale Beleg: der Client sieht den Agenten arbeiten. */
  local: boolean;
  snoozed: boolean;
  settled: boolean;
  pinned: boolean;
  /** Ein Aufmerksamkeitsmarker wie "Turn beendet" oder "Abgleich offen". */
  attention: boolean;
  working: boolean;
}

/**
 * Gruppierung der Zeile.
 * Der lokale Beleg schlägt die Serveraktivität und einen alten
 * Aufmerksamkeitsmarker: solange der Agent nachweislich arbeitet, steht die
 * Zeile in "In Arbeit" und flackert nicht zwischen zwei Bereichen. Nur eine
 * wirklich offene Eingabe steht darüber, denn sie braucht den Nutzer.
 */
function shelfOf(facts: ShelfFacts): SidebarShelf {
  if (facts.waiting) return "needs-input";
  if (facts.local) return "working";
  if (facts.attention) return "needs-input";
  if (facts.snoozed) return "snoozed";
  if (facts.settled) return "settled";
  if (facts.pinned) return "pinned";
  if (facts.working) return "working";
  return "active";
}

export function resolveSidebarRow(session: HermesV2Session | null, metadata: SidebarOrganization,
  activity: HermesV2Activity | null, now: number, local: LocalActivity = { running: false }): SidebarRowView {
  const turnWorking = activity?.state === "working" || activity?.state === "starting";
  const working = turnWorking || (activity?.subagentCount ?? 0) > 0 || (activity?.backgroundCount ?? 0) > 0;
  const waiting = activity?.state === "waiting_input" || (activity?.openRequestCount ?? 0) > 0;
  const gap = (metadata.coverage.state === "gap" || metadata.coverage.state === "identity-unknown")
    && metadata.coverage.revision > metadata.organizationCoverageRevision;
  const needsInput = waiting || metadata.attention.requiresAttention || gap;
  const snoozedUntil = metadata.effectiveSnoozedUntil;
  const settledAt = metadata.effectiveSettledAt;
  const pinned = metadata.pinRank !== null;
  const group = shelfOf({ waiting, local: local.running,
    snoozed: snoozedUntil !== null && snoozedUntil > now, settled: settledAt !== null, pinned,
    attention: needsInput, working });
  const fact = metadata.attention.latest;
  const started = turnWorking ? activity?.turnStartedAt ?? null : null;
  return {
    id: metadata.sessionId, title: session?.title || metadata.sessionId, cwd: session?.cwd ?? null,
    projectId: session?.projectId ?? null, model: session?.model ?? null, provider: session?.provider ?? null,
    group, pinned, activity: waiting ? "waiting_input" : working || local.running ? "working" : activity?.state === "idle" ? "idle" : "unknown",
    turnStartedAt: started, durationMs: working && started !== null ? Math.max(0, now - started) : null,
    requestCount: activity?.openRequestCount ?? null, subagentCount: activity?.subagentCount ?? null,
    backgroundCount: activity?.backgroundCount ?? null, unreadCount: metadata.attention.unreadCount,
    attentionKind: waiting ? "request" : metadata.attention.requiresAttention ? fact?.kind ?? "coverage" : gap ? "coverage" : null,
    attentionAt: fact?.completedAt ?? fact?.observedAt ?? null,
    attentionTimeIsObserved: fact?.completedAt === null, updatedAt: session?.updatedAt ?? null,
    snoozedUntil, settledAt, metadata, missingSummary: session === null,
  };
}

/**
 * Der lokale Beleg nachträglich auf eine bereits aufgelöste Zeile. Bleibt die
 * Zeile "In Arbeit", wenn der Server kurz "idle" meldet. Eine offene Eingabe
 * und die ausdrücklichen Entscheidungen des Nutzers bleiben darüber.
 */
export function withLocalActivity(row: SidebarRowView): SidebarRowView {
  const group = shelfOf({ waiting: row.activity === "waiting_input",
    local: true, snoozed: false, settled: false, pinned: false, attention: false, working: true });
  if (group === row.group) return row;
  return { ...row, group, activity: "working" };
}

export function compareSidebarRows(a: SidebarRowView, b: SidebarRowView): number {
  let order = 0;
  if (a.group === "pinned") order = (a.metadata.pinRank ?? Infinity) - (b.metadata.pinRank ?? Infinity);
  if (a.group === "needs-input") order = (b.attentionAt ?? -Infinity) - (a.attentionAt ?? -Infinity);
  if (a.group === "working") order = (b.turnStartedAt ?? -Infinity) - (a.turnStartedAt ?? -Infinity);
  if (a.group === "snoozed") order = (a.snoozedUntil ?? Infinity) - (b.snoozedUntil ?? Infinity);
  if (a.group === "settled") order = (b.settledAt ?? -Infinity) - (a.settledAt ?? -Infinity);
  if (a.group === "active") order = (b.updatedAt ?? -Infinity) - (a.updatedAt ?? -Infinity);
  return (Number.isNaN(order) ? 0 : order) || a.id.localeCompare(b.id, "en");
}
