// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { decodeWorkspaceFragment, encodeWorkspaceFragment, LOCAL_WORKSPACE_ID, LOCAL_WORKSPACE_URL, WORKSPACES_STORAGE_KEY, createLocalWorkspace, serializeWorkspaceRegistry, type SharedWorkspaceEntry, type WorkspaceEntry } from "./workspaceModel";
import { WORKSPACES_SYNC_KEY, type WorkspaceSnapshot } from "./workspaceStorage";

const loopbackA = "http://127.0.0.1:3010";
const loopbackB = "http://localhost:3010";

function resetStore() {
  window.localStorage.clear();
  useWorkspaceRegistry.setState({ entries: [], selfUrl: null, initialized: false, switchingWorkspace: null, changedAt: {}, deletedAt: {} });
}

function share(entries: readonly WorkspaceEntry[]): SharedWorkspaceEntry[] {
  return entries.map(({ id, name, url, addedAt, lastUsedAt }) => ({ id, name, url, addedAt, lastUsedAt }));
}

describe("Workspace-Registry-Store", () => {
  beforeEach(resetStore);

  it("legt bei einer entfernten Einzelinstanz keinen erfundenen lokalen Server an", () => {
    useWorkspaceRegistry.getState().initialize("https://wrapt.example.ts.net", "Server");
    expect(useWorkspaceRegistry.getState().entries.map((entry) => entry.url)).toEqual(["https://wrapt.example.ts.net"]);
  });

  it("entfernt einen früher automatisch angelegten Loopback-Eintrag, behält bewusst hinzugefügte Hosts", () => {
    const auto = createLocalWorkspace();
    const explicit = { ...auto, id: "explicit-local" };
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, serializeWorkspaceRegistry([auto]));
    useWorkspaceRegistry.getState().initialize("https://wrapt.example.ts.net", "Server");
    expect(useWorkspaceRegistry.getState().entries.some((entry) => entry.id === LOCAL_WORKSPACE_ID)).toBe(false);

    resetStore();
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, serializeWorkspaceRegistry([explicit]));
    useWorkspaceRegistry.getState().initialize("https://wrapt.example.ts.net", "Server");
    expect(useWorkspaceRegistry.getState().entries.map((entry) => entry.url)).toContain(LOCAL_WORKSPACE_URL);
  });

  it("migriert einen alten Registry-Snapshot und synchronisiert zwei konkurrierende Hosts", () => {
    const legacy = createLocalWorkspace();
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, serializeWorkspaceRegistry([legacy]));
    useWorkspaceRegistry.getState().initialize(loopbackA, "Dieses Gerät");
    expect(window.localStorage.getItem(WORKSPACES_SYNC_KEY)).toContain('"version":2');
    const self = useWorkspaceRegistry.getState().entries[0];
    if (!self) throw new Error("Self fehlt");
    const a = useWorkspaceRegistry.getState().add("A", "https://a.example.ts.net");
    if (!a) throw new Error("Host A fehlt");
    const b = { ...a, id: "host-b", name: "B", url: "https://b.example.ts.net" };
    const incoming: WorkspaceSnapshot = { entries: [self, b], changedAt: { [self.url]: self.addedAt, [b.url]: b.addedAt }, deletedAt: {} };
    useWorkspaceRegistry.getState().mergeStored(incoming);
    expect(useWorkspaceRegistry.getState().entries.map((entry) => entry.url)).toEqual([loopbackA, a.url, b.url]);
  });

  it("übernimmt die eigene Umbenennung aus einem anderen Tab dauerhaft", () => {
    useWorkspaceRegistry.getState().initialize("https://wrapt.example.ts.net", "Server");
    const self = useWorkspaceRegistry.getState().entries[0];
    if (!self) throw new Error("Self fehlt");
    const renamed = { ...self, name: "MacBook", customName: true };
    const incoming: WorkspaceSnapshot = {
      entries: [renamed],
      changedAt: { [self.url]: new Date(Date.now() + 1000).toISOString() },
      deletedAt: {},
    };
    useWorkspaceRegistry.getState().mergeStored(incoming);
    expect(useWorkspaceRegistry.getState().entries[0]).toEqual(renamed);
    const stored = window.localStorage.getItem(WORKSPACES_SYNC_KEY);
    expect(stored).toContain('"name":"MacBook"');
    useWorkspaceRegistry.getState().mergeStored({ entries: [self], changedAt: { [self.url]: self.addedAt }, deletedAt: {} });
    expect(useWorkspaceRegistry.getState().entries[0]).toEqual(renamed);
  });

  it("behält den frei vergebenen Servernamen beim Hin- und Rückwechsel", () => {
    const macUrl = "https://macbook.example.ts.net";
    const secondUrl = "https://second.example.ts.net";
    useWorkspaceRegistry.getState().initialize(macUrl, "MacBook");
    const second = useWorkspaceRegistry.getState().add("Zweitserver", secondUrl);
    expect(second).toMatchObject({ name: "Zweitserver", customName: true });

    const incomingOnSecond = decodeWorkspaceFragment(encodeWorkspaceFragment(useWorkspaceRegistry.getState().entries));
    resetStore();
    useWorkspaceRegistry.getState().initialize(secondUrl, "Server-Instanz", incomingOnSecond);
    expect(useWorkspaceRegistry.getState().entries[0]).toMatchObject({
      url: secondUrl,
      name: "Zweitserver",
      customName: true,
    });

    const incomingBackOnMac = decodeWorkspaceFragment(encodeWorkspaceFragment(useWorkspaceRegistry.getState().entries));
    resetStore();
    useWorkspaceRegistry.getState().initialize(macUrl, "MacBook", incomingBackOnMac);
    expect(useWorkspaceRegistry.getState().entries[0]).toMatchObject({ url: macUrl, name: "MacBook" });
    expect(useWorkspaceRegistry.getState().entries.find((entry) => entry.url === secondUrl)).toMatchObject({
      name: "Zweitserver",
      customName: true,
    });
  });

  it("behält Fremdeinträge und beide Loopback-Aliase in beiden Wechselrichtungen", () => {
    const registry = useWorkspaceRegistry.getState();
    registry.initialize(loopbackA, "Gerät A");
    const selfA = useWorkspaceRegistry.getState().entries[0];
    const aliasB = useWorkspaceRegistry.getState().add("Gerät B", loopbackB);
    const foreign = useWorkspaceRegistry.getState().add("Remote", "https://remote.example.ts.net");
    expect(selfA).toBeDefined();
    expect(aliasB).not.toBeNull();
    expect(foreign).not.toBeNull();
    if (!selfA || !aliasB || !foreign) throw new Error("Test-Workspace konnte nicht angelegt werden.");
    useWorkspaceRegistry.getState().markUsed(foreign.id);
    const usedForeign = useWorkspaceRegistry.getState().entries.find((entry) => entry.url === foreign.url);
    if (!usedForeign) throw new Error("Fremd-Workspace fehlt nach der Nutzung.");

    const snapshotA = useWorkspaceRegistry.getState().entries;
    const storageA = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
    resetStore();
    useWorkspaceRegistry.getState().initialize(loopbackB, "Gerät B", share(snapshotA));

    const entriesB = useWorkspaceRegistry.getState().entries;
    expect(entriesB[0]).toMatchObject({ id: aliasB.id, url: loopbackB, name: "Gerät B", addedAt: aliasB.addedAt });
    expect(entriesB.map((entry) => entry.url)).toEqual([loopbackB, loopbackA, foreign.url]);
    expect(entriesB.find((entry) => entry.url === loopbackA)?.id).toBe(selfA.id);
    expect(entriesB.find((entry) => entry.url === foreign.url)).toMatchObject({
      id: foreign.id,
      addedAt: foreign.addedAt,
      lastUsedAt: usedForeign.lastUsedAt,
    });
    const storageB = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);

    resetStore();
    if (!storageA) throw new Error("Test-Registry A wurde nicht gespeichert.");
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, storageA);
    useWorkspaceRegistry.getState().initialize(loopbackA, "Gerät A", share(entriesB));

    const entriesA = useWorkspaceRegistry.getState().entries;
    expect(entriesA[0]).toMatchObject({ id: selfA.id, url: loopbackA });
    expect(entriesA.map((entry) => entry.url)).toEqual([loopbackA, loopbackB, foreign.url]);
    expect(entriesA.find((entry) => entry.url === loopbackB)?.id).toBe(aliasB.id);
    expect(entriesA.find((entry) => entry.url === foreign.url)).toMatchObject({
      id: foreign.id,
      addedAt: foreign.addedAt,
      lastUsedAt: usedForeign.lastUsedAt,
    });
    expect(storageB).not.toBeNull();
    expect(new Set(entriesA.map((entry) => entry.id)).size).toBe(entriesA.length);
    expect(new Set(entriesA.map((entry) => entry.url)).size).toBe(entriesA.length);
  });
});
