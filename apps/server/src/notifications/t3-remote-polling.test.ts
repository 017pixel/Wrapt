import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { NotificationDatabase } from "./database.js";
import { T3StatusSync, type RemoteSnapshot, type RemoteT3Source, type ThreadRow } from "./t3-status-sync.js";
import { remoteT3SourceKey } from "./t3-remote-scheduler.js";

const cleanup: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); vi.restoreAllMocks(); });
type RemoteRead = NonNullable<ConstructorParameters<typeof T3StatusSync>[0]["remoteRead"]>;
const source: RemoteT3Source = { host: "fixture", databasePath: "/state.sqlite", environmentIdPath: "/environment-id" };
const snapshot = (sequence: number, rows: ThreadRow[] = []): RemoteSnapshot => ({ environmentId: "remote", currentSequence: sequence, touched: rows.map((row) => row.threadId), rows, activities: {} });
async function fixture(sources: RemoteT3Source[], read: NonNullable<ConstructorParameters<typeof T3StatusSync>[0]["remoteRead"]>) {
  const root = await mkdtemp(join(tmpdir(), "wrapt-t3-polling-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const notifications = new NotificationDatabase(join(root, "notifications.sqlite"));
  cleanup.push(() => notifications.close());
  const cursorPath = join(root, "cursor.json");
  const options = { databasePath: join(root, "fehlend.sqlite"), environmentIdPath: join(root, "environment-id"), notifications,
    pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, cursorPath, remoteSources: sources, remoteRead: read };
  const sync = new T3StatusSync(options);
  cleanup.push(() => sync.stop());
  return { root, notifications, cursorPath, options, sync };
}

it("pollt lokal weiter während ein zwanzig Sekunden langer Remote-Read läuft", async () => {
  const read = vi.fn<RemoteRead>(async () => { await new Promise((resolve) => setTimeout(resolve, 20_000)); return snapshot(1); });
  const { sync } = await fixture([source], read);
  const local = vi.spyOn(sync as unknown as { pollLocal(): void }, "pollLocal");
  vi.useFakeTimers();
  sync.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(local).toHaveBeenCalledTimes(4);
  expect(read).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(local).toHaveBeenCalledTimes(6);
  expect(read).toHaveBeenCalledTimes(2);
  // Die Fakequelle unterstützt Abort wie der echte SSH-Reader.
  await vi.advanceTimersByTimeAsync(20_000);
  const stop = sync.stop();
  await vi.advanceTimersByTimeAsync(20_000);
  await stop;
});

it("committtet Cursor erst nach erfolgreicher Verarbeitung und invalidiert einen DB-Wechsel", async () => {
  const read = vi.fn<RemoteRead>(async () => snapshot(4));
  const { notifications, sync, cursorPath, options } = await fixture([source], read);
  await sync.poll();
  const cursor = `${cursorPath}.remote-fixture`;
  expect(JSON.parse(await readFile(cursor, "utf8")).lastSequence).toBe(4);
  const row = { threadId: "thread", title: "Dummy", projectId: "projekt", updatedAt: "2026-01-01T00:00:00Z", pendingUserInputCount: 1 } as ThreadRow;
  read.mockImplementation(async () => snapshot(5, [row]));
  const fail = vi.spyOn(notifications, "create").mockImplementationOnce(() => { throw new Error("Writefehler"); });
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(5_000);
  await sync.poll();
  expect(JSON.parse(await readFile(cursor, "utf8")).lastSequence).toBe(4);
  fail.mockRestore();
  await vi.advanceTimersByTimeAsync(15_000);
  await sync.poll();
  expect(JSON.parse(await readFile(cursor, "utf8")).lastSequence).toBe(5);
  await sync.stop();
  let changedInput: { initialized: boolean; lastSequence: number } | undefined;
  const changedRead = vi.fn<RemoteRead>(async (_entry, state) => { changedInput = { ...state }; return snapshot(7); });
  const changed = new T3StatusSync({ ...options, remoteSources: [{ ...source, databasePath: "/other.sqlite" }], remoteRead: changedRead });
  cleanup.push(() => changed.stop());
  await changed.poll();
  expect(changedInput).toMatchObject({ initialized: false, lastSequence: 0 });
});

it("hält zwei Datenbanken desselben Hosts getrennt und stellt beide Cursor wieder her", async () => {
  const sources = [source, { ...source, databasePath: "/other.sqlite" }];
  const read = vi.fn<RemoteRead>(async (entry) => snapshot(entry.databasePath === source.databasePath ? 3 : 9));
  const { sync, options } = await fixture(sources, read);
  await sync.poll();
  await sync.stop();
  const restoredInputs: Array<{ initialized: boolean; lastSequence: number }> = [];
  const restoredRead = vi.fn<RemoteRead>(async (entry, state) => { restoredInputs.push({ ...state }); return snapshot(entry.databasePath === source.databasePath ? 3 : 9); });
  const restored = new T3StatusSync({ ...options, remoteRead: restoredRead });
  cleanup.push(() => restored.stop());
  await restored.poll();
  expect(restoredInputs).toEqual([
    expect.objectContaining({ initialized: true, lastSequence: 3 }), expect.objectContaining({ initialized: true, lastSequence: 9 }),
  ]);
});

it("übernimmt den vorhandenen Hostcursor beim Hinzufügen einer zweiten Datenbank ohne Verlust", async () => {
  const sources = [source, { ...source, databasePath: "/other.sqlite" }];
  const inputs: Array<{ initialized: boolean; lastSequence: number }> = [];
  const read = vi.fn<RemoteRead>(async (_entry, state) => { inputs.push({ ...state }); return snapshot(9); });
  const { options, cursorPath } = await fixture(sources, read);
  await writeFile(`${cursorPath}.remote-fixture`, JSON.stringify({ lastSequence: 3, sourceIdentity: remoteT3SourceKey(source), pendingFinals: [] }));
  const migrated = new T3StatusSync(options);
  cleanup.push(() => migrated.stop());
  await migrated.poll();
  expect(inputs).toEqual([{ lastSequence: 3, initialized: true }, { lastSequence: 0, initialized: false }]);
});
