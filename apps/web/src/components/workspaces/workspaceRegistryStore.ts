import { create } from "zustand";
import {
  createWorkspaceEntry,
  createWorkspaceId,
  ensureSelfWorkspace,
  isLoopbackWorkspace,
  mergeWorkspaceEntries,
  normalizeWorkspaceUrl,
  serializeWorkspaceRegistry,
  encodeWorkspaceFragment,
  LOCAL_WORKSPACE_ID,
  MAX_WORKSPACES,
  WORKSPACES_STORAGE_KEY,
  type SharedWorkspaceEntry,
  type WorkspaceEntry,
} from "./workspaceModel";
import {
  WORKSPACES_SYNC_KEY,
  emptyWorkspaceSnapshot,
  legacyWorkspaceSnapshot,
  mergeWorkspaceSnapshots,
  nextWorkspaceClock,
  parseWorkspaceSnapshot,
  serializeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "./workspaceStorage";

interface WorkspaceRegistryState {
  entries: WorkspaceEntry[];
  selfUrl: string | null;
  initialized: boolean;
  switchingWorkspace: { name: string; href: string } | null;
  changedAt: Record<string, string>;
  deletedAt: Record<string, string>;
  initialize(origin: string, name: string, incoming?: readonly SharedWorkspaceEntry[]): void;
  updateSelfName(name: string, custom?: boolean): void;
  add(name: string, url: string): WorkspaceEntry | null;
  edit(id: string, name: string, url: string): boolean;
  remove(id: string): void;
  markUsed(id: string): void;
  mergeStored(snapshot: WorkspaceSnapshot): void;
  beginSwitch(id: string): void;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readSavedEntries(): { snapshot: WorkspaceSnapshot; hasRegistry: boolean } {
  const storage = browserStorage();
  if (!storage) return { snapshot: emptyWorkspaceSnapshot(), hasRegistry: false };
  try {
    const snapshot = parseWorkspaceSnapshot(storage.getItem(WORKSPACES_SYNC_KEY))
      ?? legacyWorkspaceSnapshot(storage.getItem(WORKSPACES_STORAGE_KEY));
    return { snapshot: snapshot ?? emptyWorkspaceSnapshot(), hasRegistry: snapshot !== null };
  } catch {
    return { snapshot: emptyWorkspaceSnapshot(), hasRegistry: false };
  }
}

function persistEntries(snapshot: WorkspaceSnapshot): void {
  try {
    const storage = browserStorage();
    storage?.setItem(WORKSPACES_SYNC_KEY, serializeWorkspaceSnapshot(snapshot));
    storage?.setItem(WORKSPACES_STORAGE_KEY, serializeWorkspaceRegistry(snapshot.entries));
  } catch {
    // Ein voller oder gesperrter Browser-Speicher darf die Navigation nicht blockieren.
  }
}

function sharedEntries(entries: readonly SharedWorkspaceEntry[]): WorkspaceEntry[] {
  const now = new Date().toISOString();
  return entries.map((entry) => ({
    ...entry,
    addedAt: entry.addedAt ?? now,
    lastUsedAt: entry.lastUsedAt ?? null,
  }));
}

function latestClock(...values: (string | undefined)[]): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function isDefaultLoopbackOrigin(url: string): boolean {
  const normalized = normalizeWorkspaceUrl(url);
  return Boolean(normalized && isLoopbackWorkspace(normalized) && new URL(normalized).port === "3010");
}

export const useWorkspaceRegistry = create<WorkspaceRegistryState>((set, get) => ({
  entries: [],
  selfUrl: null,
  initialized: false,
  switchingWorkspace: null,
  changedAt: {},
  deletedAt: {},
  initialize(origin, name, incoming) {
    const selfUrl = normalizeWorkspaceUrl(origin);
    if (!selfUrl) return;
    const initializedAt = new Date();
    const saved = readSavedEntries();
    const loopbackSelf = isDefaultLoopbackOrigin(selfUrl);
    const base = saved.hasRegistry
      ? saved.snapshot.entries.filter((entry) => {
        if (loopbackSelf && entry.url !== selfUrl && isDefaultLoopbackOrigin(entry.url)) return false;
        // Ältere Versionen haben im Remote-Browser einen lokalen Host erfunden.
        return entry.url === selfUrl || entry.id !== LOCAL_WORKSPACE_ID;
      })
      : [];
    const preferredSelf = incoming?.find((entry) => normalizeWorkspaceUrl(entry.url) === selfUrl);
    const savedSelf = base.find((entry) => entry.url === selfUrl);
    const customSelf = savedSelf?.customName === true;
    const initialName = customSelf
      ? savedSelf?.name ?? name
      : preferredSelf?.customName
        ? preferredSelf.name
        : savedSelf && name === "Dieses Gerät" ? savedSelf.name : name;
    const withSelf = ensureSelfWorkspace(
      base,
      selfUrl,
      initialName,
      initializedAt,
      createWorkspaceId,
      preferredSelf?.id,
      preferredSelf?.addedAt,
      preferredSelf?.lastUsedAt,
    );
    const self = withSelf.find((entry) => entry.url === selfUrl);
    if (!self) return;
    const activeSelf = {
      ...self,
      ...(customSelf || preferredSelf?.customName ? { customName: true } : {}),
      lastUsedAt: initializedAt.toISOString(),
    };
    const activeEntries = [activeSelf, ...withSelf.filter((entry) => entry.url !== selfUrl)];
    const entries = incoming === undefined
      ? activeEntries
      : mergeWorkspaceEntries(
        activeEntries,
        sharedEntries(incoming).filter((entry) => entry.id !== LOCAL_WORKSPACE_ID || entry.url === selfUrl),
        activeSelf,
      );
    const changedAt = { ...saved.snapshot.changedAt, [selfUrl]: saved.snapshot.changedAt[selfUrl] ?? initializedAt.toISOString() };
    const snapshot = mergeWorkspaceSnapshots(
      { entries, changedAt, deletedAt: saved.snapshot.deletedAt },
      emptyWorkspaceSnapshot(),
      selfUrl,
    );
    persistEntries(snapshot);
    set({ ...snapshot, selfUrl, initialized: true });
  },
  updateSelfName(name, custom = true) {
    const { entries, selfUrl, changedAt, deletedAt } = get();
    if (!selfUrl || !name.trim()) return;
    const current = entries.find((entry) => entry.url === selfUrl);
    if (!current || (!custom && current.customName) || (current.name === name.trim() && current.customName === custom)) return;
    const updated = entries.map((entry) => entry.url === selfUrl
      ? {
        ...entry,
        name: name.trim(),
        ...(custom ? { customName: true } : {}),
      }
      : entry);
    const snapshot = { entries: updated, changedAt: { ...changedAt, [selfUrl]: nextWorkspaceClock(changedAt[selfUrl]) }, deletedAt };
    persistEntries(snapshot);
    set(snapshot);
  },
  add(name, url) {
    const normalized = normalizeWorkspaceUrl(url);
    if (!normalized) return null;
    const { entries: currentEntries, changedAt, deletedAt } = get();
    const existing = currentEntries.find((entry) => entry.url === normalized);
    if (existing) return existing;
    if (currentEntries.length >= MAX_WORKSPACES) return null;
    const createdEntry = createWorkspaceEntry(createWorkspaceId(), name, normalized);
    if (!createdEntry) return null;
    const entry = { ...createdEntry, customName: true };
    const entries = [...currentEntries, entry];
    const snapshot = { entries, changedAt: { ...changedAt, [entry.url]: nextWorkspaceClock(latestClock(changedAt[entry.url], deletedAt[entry.url])) }, deletedAt };
    persistEntries(snapshot);
    set(snapshot);
    return entry;
  },
  edit(id, name, url) {
    const { entries, selfUrl, changedAt, deletedAt } = get();
    const target = entries.find((entry) => entry.id === id);
    const normalizedUrl = normalizeWorkspaceUrl(url);
    const normalizedName = name.trim();
    if (!target || target.url === selfUrl || !normalizedUrl || !normalizedName || normalizedName.length > 80) return false;
    if (entries.some((entry) => entry.id !== id && entry.url === normalizedUrl)) return false;
    const updated = entries.map((entry) => entry.id === id
      ? { ...entry, name: normalizedName, customName: true, url: normalizedUrl }
      : entry);
    const nextDeletedAt = { ...deletedAt };
    if (target.url !== normalizedUrl) nextDeletedAt[target.url] = nextWorkspaceClock(latestClock(changedAt[target.url], deletedAt[target.url]));
    const snapshot = {
      entries: updated,
      changedAt: { ...changedAt, [normalizedUrl]: nextWorkspaceClock(latestClock(changedAt[normalizedUrl], deletedAt[normalizedUrl])) },
      deletedAt: nextDeletedAt,
    };
    persistEntries(snapshot);
    set(snapshot);
    return true;
  },
  remove(id) {
    const { entries, selfUrl, changedAt, deletedAt } = get();
    const target = entries.find((entry) => entry.id === id);
    if (!target || target.url === selfUrl) return;
    const updated = entries.filter((entry) => entry.id !== id);
    const snapshot = { entries: updated, changedAt, deletedAt: { ...deletedAt, [target.url]: nextWorkspaceClock(latestClock(changedAt[target.url], deletedAt[target.url])) } };
    persistEntries(snapshot);
    set(snapshot);
  },
  markUsed(id) {
    const { changedAt, deletedAt } = get();
    const target = get().entries.find((entry) => entry.id === id);
    if (!target) return;
    const entries = get().entries.map((entry) => entry.id === id ? { ...entry, lastUsedAt: new Date().toISOString() } : entry);
    const snapshot = { entries, changedAt: { ...changedAt, [target.url]: nextWorkspaceClock(changedAt[target.url]) }, deletedAt };
    persistEntries(snapshot);
    set(snapshot);
  },
  mergeStored(incoming) {
    const { entries, selfUrl, changedAt, deletedAt } = get();
    if (!selfUrl || !entries.some((entry) => entry.url === selfUrl)) return;
    const merged = mergeWorkspaceSnapshots({ entries, changedAt, deletedAt }, incoming, selfUrl);
    persistEntries(merged);
    set(merged);
  },
  beginSwitch(id) {
    const { entries, selfUrl } = get();
    const target = entries.find((entry) => entry.id === id);
    if (!target || target.url === selfUrl) return;
    get().markUsed(id);
    const latestEntries = get().entries;
    set({ switchingWorkspace: { name: target.name, href: `${target.url}/wrapt/${encodeWorkspaceFragment(latestEntries)}` } });
  },
}));
