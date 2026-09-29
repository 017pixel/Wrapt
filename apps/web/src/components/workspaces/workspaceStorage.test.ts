import { describe, expect, it } from "vitest";
import { createWorkspaceEntry, type WorkspaceEntry } from "./workspaceModel";
import { mergeWorkspaceSnapshots, parseWorkspaceSnapshot, serializeWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspaceStorage";

const selfUrl = "https://self.example.ts.net";
const early = "2026-09-27T10:00:00.000Z";
const late = "2026-09-27T10:01:00.000Z";

function entry(id: string, url: string, at = early): WorkspaceEntry {
  const created = createWorkspaceEntry(id, id, url, new Date(at));
  if (!created) throw new Error("Ungültiger Testeintrag");
  return created;
}

function snapshot(entries: WorkspaceEntry[], deletedAt: Record<string, string> = {}): WorkspaceSnapshot {
  return { entries, changedAt: Object.fromEntries(entries.map((item) => [item.url, item.addedAt])), deletedAt };
}

describe("Workspace-Synchronisierung", () => {
  it("behält zwei gleichzeitig in getrennten Tabs hinzugefügte Hosts", () => {
    const self = entry("self", selfUrl);
    const a = entry("a", "https://a.example.ts.net");
    const b = entry("b", "https://b.example.ts.net");
    const fromA = mergeWorkspaceSnapshots(snapshot([self, a]), snapshot([self, b]), selfUrl);
    const fromB = mergeWorkspaceSnapshots(snapshot([self, b]), snapshot([self, a]), selfUrl);
    const serializedA = serializeWorkspaceSnapshot(fromA);
    const serializedB = serializeWorkspaceSnapshot(fromB);
    expect(serializedB).toBe(serializedA);

    const incomingA = parseWorkspaceSnapshot(serializedA);
    const incomingB = parseWorkspaceSnapshot(serializedB);
    if (!incomingA || !incomingB) throw new Error("Konvergierter Workspace-Snapshot ist ungültig.");
    const nextA = mergeWorkspaceSnapshots(fromA, incomingB, selfUrl);
    const nextB = mergeWorkspaceSnapshots(fromB, incomingA, selfUrl);
    expect(serializeWorkspaceSnapshot(nextA)).toBe(serializedA);
    expect(serializeWorkspaceSnapshot(nextB)).toBe(serializedB);
    expect(fromA.entries.map((item) => item.url)).toEqual([selfUrl, a.url, b.url]);
    expect(fromB.entries.map((item) => item.url)).toEqual([selfUrl, a.url, b.url]);
  });

  it("serialisiert Uhren unabhängig von ihrer Einfügereihenfolge", () => {
    const self = entry("self", selfUrl);
    const a = entry("a", "https://a.example.ts.net");
    const b = entry("b", "https://b.example.ts.net");
    const first: WorkspaceSnapshot = {
      entries: [self, a, b],
      changedAt: { [selfUrl]: early, [a.url]: early, [b.url]: late },
      deletedAt: { "https://z.example.ts.net": late, "https://c.example.ts.net": early },
    };
    const second: WorkspaceSnapshot = {
      entries: [self, b, a],
      changedAt: { [b.url]: late, [a.url]: early, [selfUrl]: early },
      deletedAt: { "https://c.example.ts.net": early, "https://z.example.ts.net": late },
    };
    expect(serializeWorkspaceSnapshot(first)).toBe(serializeWorkspaceSnapshot(second));
  });

  it("lässt eine Löschung gegen alte Snapshots gewinnen und ein späteres Hinzufügen zu", () => {
    const self = entry("self", selfUrl);
    const host = entry("host", "https://host.example.ts.net");
    const removed = snapshot([self], { [host.url]: late });
    const stale = snapshot([self, host]);
    expect(mergeWorkspaceSnapshots(removed, stale, selfUrl).entries).toEqual([self]);
    const addedAgain = snapshot([self, entry("new-host", host.url, "2026-09-27T10:02:00.000Z")]);
    expect(mergeWorkspaceSnapshots(removed, addedAgain, selfUrl).entries.map((item) => item.url)).toContain(host.url);
  });

  it("übernimmt den neueren Namen des eigenen Hosts aus einem anderen Tab", () => {
    const original = entry("self", selfUrl);
    const renamed = { ...original, name: "MacBook", customName: true };
    const incoming = { ...snapshot([renamed]), changedAt: { [selfUrl]: late } };
    const merged = mergeWorkspaceSnapshots(snapshot([original]), incoming, selfUrl);
    expect(merged.entries[0]).toEqual(renamed);
    expect(mergeWorkspaceSnapshots(merged, snapshot([original]), selfUrl).entries[0]).toEqual(renamed);
  });

  it("liest nur gültige gespeicherte Snapshots", () => {
    const original = snapshot([entry("self", selfUrl)]);
    expect(parseWorkspaceSnapshot(serializeWorkspaceSnapshot(original))).toEqual(original);
    expect(parseWorkspaceSnapshot('{"version":2,"workspaces":"kaputt"}')).toBeNull();
  });
});
