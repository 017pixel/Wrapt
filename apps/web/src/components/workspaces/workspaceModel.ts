export const WORKSPACES_STORAGE_KEY = "wrapt.workspaces.v1";
export const WORKSPACES_FRAGMENT_KEY = "wraptWorkspaces";
export const MAX_WORKSPACES = 32;
export const LOCAL_WORKSPACE_ID = "local-loopback-3010";
export const LOCAL_WORKSPACE_URL = "http://127.0.0.1:3010";

export interface WorkspaceEntry {
  id: string;
  name: string;
  customName?: boolean;
  url: string;
  addedAt: string;
  lastUsedAt: string | null;
}

export interface SharedWorkspaceEntry {
  id: string;
  name: string;
  customName?: boolean;
  url: string;
  addedAt?: string;
  lastUsedAt?: string | null;
}

const workspaceIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function normalizeWorkspaceUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.username || parsed.password || parsed.origin === "null") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isLoopbackWorkspace(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host.startsWith("127.");
  } catch {
    return false;
  }
}

function validName(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) return false;
  return ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseWorkspaceEntry(value: unknown): WorkspaceEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const url = typeof candidate.url === "string" ? normalizeWorkspaceUrl(candidate.url) : null;
  if (typeof candidate.id !== "string" || !workspaceIdPattern.test(candidate.id)) return null;
  if (!validName(candidate.name) || !url || !validDate(candidate.addedAt)) return null;
  const lastUsedAt = validDate(candidate.lastUsedAt) ? candidate.lastUsedAt : null;
  return {
    id: candidate.id,
    name: candidate.name.trim(),
    ...(candidate.customName === true ? { customName: true } : {}),
    url,
    addedAt: candidate.addedAt,
    lastUsedAt,
  };
}

export function parseWorkspaceRegistry(serialized: string | null): WorkspaceEntry[] | null {
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return null;
    const root = value as Record<string, unknown>;
    if (root.version !== 1 || !Array.isArray(root.workspaces)) return null;
    return uniqueWorkspaceEntries(root.workspaces.map(parseWorkspaceEntry).filter(isWorkspaceEntry));
  } catch {
    return null;
  }
}

function isWorkspaceEntry(value: WorkspaceEntry | null): value is WorkspaceEntry {
  return value !== null;
}

function uniqueWorkspaceEntries(entries: readonly WorkspaceEntry[]): WorkspaceEntry[] {
  const result: WorkspaceEntry[] = [];
  for (const entry of entries) {
    const sameUrlIndex = result.findIndex((saved) => saved.url === entry.url);
    if (sameUrlIndex >= 0) {
      const saved = result[sameUrlIndex];
      if (saved) {
        result[sameUrlIndex] = {
          ...saved,
          name: saved.customName ? saved.name : entry.name,
          ...(saved.customName || entry.customName ? { customName: true } : {}),
          addedAt: earlierDate(saved.addedAt, entry.addedAt),
          lastUsedAt: laterDate(saved.lastUsedAt, entry.lastUsedAt),
        };
      }
      continue;
    }

    const uniqueEntry = result.some((saved) => saved.id === entry.id)
      ? { ...entry, id: disambiguateWorkspaceId(entry.id, entry.url, new Set(result.map((saved) => saved.id))) }
      : entry;
    if (result.length < MAX_WORKSPACES) result.push(uniqueEntry);
  }
  return result;
}

function disambiguateWorkspaceId(id: string, url: string, usedIds: ReadonlySet<string>): string {
  let hash = 2166136261;
  for (const character of url) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const fingerprint = (hash >>> 0).toString(36);
  let attempt = 0;
  while (true) {
    const suffix = `-copy-${fingerprint}${attempt ? `-${attempt}` : ""}`;
    const candidate = `${id.slice(0, Math.max(1, 128 - suffix.length))}${suffix}`;
    if (workspaceIdPattern.test(candidate) && !usedIds.has(candidate)) return candidate;
    attempt += 1;
  }
}

function earlierDate(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

export function serializeWorkspaceRegistry(entries: readonly WorkspaceEntry[]): string {
  return JSON.stringify({ version: 1, workspaces: uniqueWorkspaceEntries(entries.map((entry) => parseWorkspaceEntry(entry)).filter(isWorkspaceEntry)) });
}

export function createWorkspaceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createWorkspaceEntry(id: string, name: string, rawUrl: string, now = new Date()): WorkspaceEntry | null {
  const url = normalizeWorkspaceUrl(rawUrl);
  const trimmedName = name.trim();
  if (!url || !workspaceIdPattern.test(id) || !validName(trimmedName)) return null;
  return { id, name: trimmedName, url, addedAt: now.toISOString(), lastUsedAt: null };
}

export function createLocalWorkspace(now = new Date()): WorkspaceEntry {
  return {
    id: LOCAL_WORKSPACE_ID,
    name: "Dieses Gerät",
    url: LOCAL_WORKSPACE_URL,
    addedAt: now.toISOString(),
    lastUsedAt: null,
  };
}

export function ensureSelfWorkspace(
  entries: readonly WorkspaceEntry[],
  origin: string,
  name: string,
  now = new Date(),
  idFactory = createWorkspaceId,
  preferredId?: string,
  preferredAddedAt?: string,
  preferredLastUsedAt?: string | null,
): WorkspaceEntry[] {
  const url = normalizeWorkspaceUrl(origin);
  if (!url) return [...entries];
  const saved = uniqueWorkspaceEntries(entries.map((entry) => parseWorkspaceEntry(entry)).filter(isWorkspaceEntry));
  const existing = saved.find((entry) => entry.url === url);
  const suggestedId = preferredId && workspaceIdPattern.test(preferredId) ? preferredId : undefined;
  const self: WorkspaceEntry = {
    id: existing?.id ?? suggestedId ?? idFactory(),
    name: existing?.customName ? existing.name : validName(name) ? name.trim() : "Dieses Gerät",
    ...(existing?.customName ? { customName: true } : {}),
    url,
    addedAt: existing?.addedAt ?? (validDate(preferredAddedAt) ? preferredAddedAt : now.toISOString()),
    lastUsedAt: existing?.lastUsedAt ?? (validDate(preferredLastUsedAt) ? preferredLastUsedAt : null),
  };
  const remaining = saved.filter((entry) => entry.url !== self.url);
  return uniqueWorkspaceEntries([self, ...remaining]).slice(0, MAX_WORKSPACES);
}

export function mergeWorkspaceEntries(
  current: readonly WorkspaceEntry[],
  incoming: readonly WorkspaceEntry[],
  self: WorkspaceEntry,
): WorkspaceEntry[] {
  const saved = uniqueWorkspaceEntries(current.map((entry) => parseWorkspaceEntry(entry)).filter(isWorkspaceEntry));
  const validSelf = parseWorkspaceEntry(self);
  if (!validSelf) return saved;
  const result: WorkspaceEntry[] = [validSelf];

  for (const entry of uniqueWorkspaceEntries(incoming.map((rawEntry) => parseWorkspaceEntry(rawEntry)).filter(isWorkspaceEntry))) {
    if (entry.url === validSelf.url) continue;
    const sameUrl = saved.find((savedEntry) => savedEntry.url === entry.url);
    if (sameUrl) {
      const merged: WorkspaceEntry = {
        ...entry,
        id: sameUrl.id,
        name: sameUrl.customName ? sameUrl.name : entry.name,
        ...(sameUrl.customName || entry.customName ? { customName: true } : {}),
        addedAt: earlierDate(sameUrl.addedAt, entry.addedAt),
        lastUsedAt: laterDate(sameUrl.lastUsedAt, entry.lastUsedAt),
      };
      const resultIndex = result.findIndex((resultEntry) => resultEntry.url === entry.url);
      if (resultIndex >= 0) result[resultIndex] = merged;
      else if (result.length < MAX_WORKSPACES) result.push(merged);
      continue;
    }
    if (result.length >= MAX_WORKSPACES) continue;
    const uniqueEntry = result.some((resultEntry) => resultEntry.id === entry.id)
      ? { ...entry, id: disambiguateWorkspaceId(entry.id, entry.url, new Set(result.map((resultEntry) => resultEntry.id))) }
      : entry;
    result.push(uniqueEntry);
  }

  return uniqueWorkspaceEntries(result).slice(0, MAX_WORKSPACES);
}

function laterDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function encodeWorkspaceFragment(entries: readonly WorkspaceEntry[]): string {
  const shared: SharedWorkspaceEntry[] = uniqueWorkspaceEntries(entries.map((entry) => parseWorkspaceEntry(entry)).filter(isWorkspaceEntry))
    .map(({ id, name, customName, url, addedAt, lastUsedAt }) => ({
      id,
      name,
      ...(customName ? { customName: true } : {}),
      url,
      addedAt,
      lastUsedAt,
    }));
  return `#${WORKSPACES_FRAGMENT_KEY}=${encodeURIComponent(JSON.stringify(shared))}`;
}

export function decodeWorkspaceFragment(hash: string): SharedWorkspaceEntry[] {
  if (hash.length > 100_000) return [];
  try {
    const value = new URLSearchParams(hash.replace(/^#/, "")).get(WORKSPACES_FRAGMENT_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const candidates = parsed.flatMap((item): SharedWorkspaceEntry[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      const url = typeof candidate.url === "string" ? normalizeWorkspaceUrl(candidate.url) : null;
      if (!url || typeof candidate.id !== "string" || !workspaceIdPattern.test(candidate.id) || !validName(candidate.name)) return [];
      return [{
        id: candidate.id,
        name: candidate.name.trim(),
        ...(candidate.customName === true ? { customName: true } : {}),
        url,
        ...(validDate(candidate.addedAt) ? { addedAt: candidate.addedAt } : {}),
        ...(candidate.lastUsedAt === null || validDate(candidate.lastUsedAt)
          ? { lastUsedAt: candidate.lastUsedAt as string | null }
          : {}),
      }];
    });
    const now = new Date().toISOString();
    return uniqueWorkspaceEntries(candidates.map((entry) => ({
      ...entry,
      addedAt: entry.addedAt ?? now,
      lastUsedAt: entry.lastUsedAt ?? null,
    }))).map(({ id, name, customName, url, addedAt, lastUsedAt }) => ({
      id,
      name,
      ...(customName ? { customName: true } : {}),
      url,
      addedAt,
      lastUsedAt,
    }));
  } catch {
    return [];
  }
}
