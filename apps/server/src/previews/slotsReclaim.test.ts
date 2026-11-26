import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewSlotDatabase, PreviewSlotService, type PreviewFlags } from "./slots.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const user = "test@example.com";

async function service(options: { slotPorts: number[]; flags?: Partial<PreviewFlags> }) {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-preview-reclaim-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const database = new PreviewSlotDatabase(join(directory, "workbench.sqlite"));
  cleanup.push(() => database.close());
  const instance = new PreviewSlotService({
    database,
    slotPorts: options.slotPorts,
    publicPorts: options.slotPorts.map((_, index) => 8451 + index),
    hostname: "server.test.ts.net",
    workbenchOrigins: ["https://server.test.ts.net:8443"],
    ...(options.flags ? { flags: options.flags } : {}),
  });
  return { database, service: instance };
}

describe("Preview-Slot-Wiederherstellung", () => {
  it("stellt einen freien Slot mit alter Affinität nach verifiziertem Reset wieder bereit", async () => {
    const { service: slots } = await service({ slotPorts: [3901], flags: { slotResetEnabled: true } });
    const first = slots.openSession(user, { sessionKey: "a", projectId: "alt", primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    slots.closeSessionById(user, first.id);

    expect(() => slots.openSession(user, { sessionKey: "b", projectId: "neu", primaryPort: 4173, primaryProtocol: "http", isolate: true, storageProfileId: null }))
      .toThrowError(/nicht genügend Preview-Slots/);

    const reclaim = slots.beginReclaim("alt");
    expect(reclaim.slotId).toBe(1);
    const verified = slots.reset.verify(1, {
      nonce: reclaim.nonce,
      serviceWorkers: 0,
      cacheStorages: 0,
      localStorageKeys: 0,
      sessionStorageKeys: 0,
      indexedDatabases: 0,
      verifiable: true,
    });
    expect(verified.affinity.state).toBe("free");

    const reused = slots.openSession(user, { sessionKey: "b", projectId: "neu", primaryPort: 4173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    expect(reused.bindings[0]!.slotId).toBe(1);
  });

  it("verweigert die Wiederherstellung eines Slots, der einem anderen Projekt gehört", async () => {
    const { service: slots } = await service({ slotPorts: [3901], flags: { slotResetEnabled: true } });
    const first = slots.openSession(user, { sessionKey: "a", projectId: "alt", primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    slots.closeSessionById(user, first.id);
    expect(() => slots.beginReclaim("neu")).toThrowError(/anderen Projekt/);
    expect(slots.beginReclaim("alt").slotId).toBe(1);
  });

  it("nimmt ohne eigene Affinität einen Slot ohne Storage-Affinität", async () => {
    const { service: slots, database } = await service({ slotPorts: [3901], flags: { slotResetEnabled: true } });
    const first = slots.openSession(user, { sessionKey: "a", projectId: "alt", primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    slots.closeSessionById(user, first.id);
    database.writeAffinity({ ...database.affinity(1)!, storageOwnerKey: null, storageProjectId: null, state: "free" });
    expect(slots.beginReclaim("neu").slotId).toBe(1);
  });

  it("kann einen quarantänisierten Slot erneut verifiziert zurücksetzen", async () => {
    const { service: slots } = await service({ slotPorts: [3901], flags: { slotResetEnabled: true } });
    const first = slots.openSession(user, { sessionKey: "alt", projectId: "alt", primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    slots.closeSessionById(user, first.id);

    const failedReset = slots.beginReclaim("alt");
    const failed = slots.reset.verify(1, {
      nonce: failedReset.nonce,
      serviceWorkers: 0,
      cacheStorages: 0,
      localStorageKeys: 0,
      sessionStorageKeys: 0,
      indexedDatabases: 0,
      verifiable: false,
    });
    expect(failed.affinity.state).toBe("quarantined");

    const retry = slots.beginReclaim("alt");
    expect(retry.slotId).toBe(1);
    const verified = slots.reset.verify(1, {
      nonce: retry.nonce,
      serviceWorkers: 0,
      cacheStorages: 0,
      localStorageKeys: 0,
      sessionStorageKeys: 0,
      indexedDatabases: 0,
      verifiable: true,
    });
    expect(verified.affinity.state).toBe("free");
    expect(verified.affinity.storageOwnerKey).toBeNull();
  });

  it("lässt einen abgebrochenen Reset auslaufen und erneut beginnen", async () => {
    const { service: slots, database } = await service({ slotPorts: [3901], flags: { slotResetEnabled: true } });
    const first = slots.openSession(user, { sessionKey: "alt", projectId: "alt", primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    slots.closeSessionById(user, first.id);
    slots.beginReclaim("alt");
    const resetting = database.affinity(1)!;
    database.writeAffinity({ ...resetting, resetStartedAt: "2000-01-01T00:00:00.000Z" });

    expect(slots.beginReclaim("alt").slotId).toBe(1);
    expect(database.affinity(1)?.state).toBe("resetting");
  });
});
