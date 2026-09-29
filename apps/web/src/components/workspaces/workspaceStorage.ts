import {
  MAX_WORKSPACES,
  parseWorkspaceEntry,
  parseWorkspaceRegistry,
  type WorkspaceEntry,
} from "./workspaceModel";

export const WORKSPACES_SYNC_KEY = "wrapt.workspaces.v2";

export interface WorkspaceSnapshot {
  entries: WorkspaceEntry[];
  changedAt: Record<string, string>;
  deletedAt: Record<string, string>;
}

export const emptyWorkspaceSnapshot = (): WorkspaceSnapshot => ({ entries: [], changedAt: {}, deletedAt: {} });

function validClock(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseClocks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, clock]) => key.length < 2048 && validClock(clock))
    .map(([key, clock]) => [key, new Date(clock as string).toISOString()]));
}

export function parseWorkspaceSnapshot(serialized: string | null): WorkspaceSnapshot | null {
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return null;
    const root = value as Record<string, unknown>;
    if (root.version !== 2 || !Array.isArray(root.workspaces)) return null;
    const entries = root.workspaces.map(parseWorkspaceEntry).filter((entry): entry is WorkspaceEntry => entry !== null);
    return { entries: entries.slice(0, MAX_WORKSPACES), changedAt: parseClocks(root.changedAt), deletedAt: parseClocks(root.deletedAt) };
  } catch { return null; }
}

export function legacyWorkspaceSnapshot(serialized: string | null): WorkspaceSnapshot | null {
  const entries = parseWorkspaceRegistry(serialized);
  if (!entries) return null;
  return { entries, changedAt: Object.fromEntries(entries.map((entry) => [entry.url, entry.addedAt])), deletedAt: {} };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareText(left, right)));
}

function sortedEntries(entries: readonly WorkspaceEntry[]): WorkspaceEntry[] {
  return entries
    .map((entry) => parseWorkspaceEntry(entry))
    .filter((entry): entry is WorkspaceEntry => entry !== null)
    .sort((left, right) => compareText(left.addedAt, right.addedAt)
      || compareText(left.url, right.url)
      || compareText(left.id, right.id));
}

export function serializeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify({
    version: 2,
    workspaces: sortedEntries(snapshot.entries),
    changedAt: sortedRecord(snapshot.changedAt),
    deletedAt: sortedRecord(snapshot.deletedAt),
  });
}

export function nextWorkspaceClock(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}

function later(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

export function mergeWorkspaceSnapshots(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
  selfUrl: string,
): WorkspaceSnapshot {
  const deletedAt = { ...current.deletedAt };
  for (const [url, clock] of Object.entries(incoming.deletedAt)) {
    deletedAt[url] = later(deletedAt[url], clock) ?? clock;
  }
  const changedAt = { ...current.changedAt };
  const byUrl = new Map<string, WorkspaceEntry>();
  for (const [snapshot, entry] of [
    ...current.entries.map((item) => [current, item] as const),
    ...incoming.entries.map((item) => [incoming, item] as const),
  ]) {
    const clock = snapshot.changedAt[entry.url] ?? entry.addedAt;
    const previous = byUrl.get(entry.url);
    const previousClock = changedAt[entry.url];
    if (!previous || !previousClock || clock > previousClock || (clock === previousClock && JSON.stringify(entry) > JSON.stringify(previous))) {
      byUrl.set(entry.url, entry);
    }
    changedAt[entry.url] = later(previousClock, clock) ?? clock;
  }
  const visible = [...byUrl.values()].filter((entry) => entry.url === selfUrl || !deletedAt[entry.url] || changedAt[entry.url]! > deletedAt[entry.url]!);
  const byId = new Map<string, WorkspaceEntry>();
  for (const entry of visible) {
    const previous = byId.get(entry.id);
    if (!previous || (changedAt[entry.url] ?? "") > (changedAt[previous.url] ?? "")) byId.set(entry.id, entry);
  }
  const entries = [...byId.values()].sort((left, right) =>
    Number(right.url === selfUrl) - Number(left.url === selfUrl)
      || compareText(left.addedAt, right.addedAt)
      || compareText(left.url, right.url),
  ).slice(0, MAX_WORKSPACES);
  return { entries, changedAt: sortedRecord(changedAt), deletedAt: sortedRecord(deletedAt) };
}
