import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { OrbitDatabase, createDefaultOrbitWorkspace } from "./database.js";
import { OrbitBackupWorker, type OrbitBackupWriter } from "./backup-worker.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-backup-drain-"));
  directories.push(directory);
  return { directory, path: join(directory, "orbit.sqlite"), backups: join(directory, "backups") };
}

it("antwortet vor dem Backup und verarbeitet 50 Revisionen geordnet und dedupliziert", async () => {
  const { path, backups } = await fixture();
  const revisions: number[] = [];
  let active = 0;
  let maximum = 0;
  const writer: OrbitBackupWriter = {
    async write(item) {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      revisions.push(item.revision);
      active -= 1;
    },
    prune: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const db = new OrbitDatabase(path, backups, { writer });
  try {
    for (let index = 0; index < 50; index += 1) {
      const document = createDefaultOrbitWorkspace();
      document.boards[0]!.name = `Revision ${index}`;
      expect(db.save(document, index).revision).toBe(index + 1);
    }
    expect(db.maintenanceStatus().pendingBackups).toBe(50);
    const heartbeat = vi.fn();
    setTimeout(heartbeat, 1);
    await Promise.all([db.flushBackups(), db.flushBackups()]);
    expect(heartbeat).toHaveBeenCalledOnce();
    expect(revisions).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(maximum).toBe(1);
    expect(db.maintenanceStatus().pendingBackups).toBe(0);
  } finally { await db.close(); }
});

it("behält fehlerhafte Sicherungen in der Outbox und holt sie nach Wiederanlauf nach", async () => {
  const { path, backups } = await fixture();
  const db = new OrbitDatabase(path, backups);
  await rm(backups, { recursive: true });
  await writeFile(backups, "Kein Verzeichnis");
  db.save(createDefaultOrbitWorkspace(), 0);
  await db.flushBackups();
  expect(db.maintenanceStatus()).toMatchObject({ pendingBackups: 1, lastError: expect.any(String) });
  await db.close();
  await rm(backups);
  await mkdir(backups);
  const reopened = new OrbitDatabase(path, backups);
  try {
    await reopened.flushBackups();
    expect(reopened.maintenanceStatus()).toMatchObject({ pendingBackups: 0, lastError: null });
    expect(JSON.parse(await readFile(join(backups, "current.json"), "utf8")).revision).toBe(1);
  } finally { await reopened.close(); }
});

it("setzt current.json durch eine spät nachgeholte ältere Revision nicht zurück", async () => {
  const { path, backups } = await fixture();
  const db = new OrbitDatabase(path, backups);
  for (let index = 0; index < 3; index += 1) db.save(createDefaultOrbitWorkspace(), index);
  await db.flushBackups();
  const raw = new DatabaseSync(path);
  const item = raw.prepare("SELECT revision,created_at updatedAt,document_json documentJson FROM orbit_document_revisions WHERE revision=1").get() as {
    revision: number; updatedAt: string; documentJson: string;
  };
  const writer = new OrbitBackupWorker(backups);
  try {
    await writer.write(item);
    expect(JSON.parse(await readFile(join(backups, "current.json"), "utf8")).revision).toBe(3);
  } finally { await writer.close(); raw.close(); await db.close(); }
});

it("lässt nach begrenztem Shutdown die nicht bestätigte Revision durabel nachholbar", async () => {
  const { path, backups } = await fixture();
  let rejectWrite: (error: Error) => void = () => {};
  const writer: OrbitBackupWriter = {
    write: () => new Promise((_resolve, reject) => { rejectWrite = reject; }),
    prune: async () => {}, close: async () => { rejectWrite(new Error("Abbruch")); },
  };
  const db = new OrbitDatabase(path, backups, { writer, shutdownMilliseconds: 20 });
  db.save(createDefaultOrbitWorkspace(), 0);
  await db.close();
  const raw = new DatabaseSync(path);
  expect(raw.prepare("SELECT revision FROM orbit_backup_outbox").all()).toEqual([{ revision: 1 }]);
  raw.close();
  const reopened = new OrbitDatabase(path, backups);
  await reopened.flushBackups();
  expect(reopened.maintenanceStatus().pendingBackups).toBe(0);
  await reopened.close();
});

it("holt einen vor dem Export abrupt beendeten Save aus der SQL-Outbox nach", async () => {
  const { directory, path, backups } = await fixture();
  const script = join(directory, "crash.mts");
  const source = new URL("./database.ts", import.meta.url).pathname;
  await writeFile(script, `import { OrbitDatabase, createDefaultOrbitWorkspace } from ${JSON.stringify(source)};
    const db = new OrbitDatabase(${JSON.stringify(path)}, ${JSON.stringify(backups)});
    db.save(createDefaultOrbitWorkspace(), 0); process.exit(0);`);
  await promisify(execFile)(process.execPath, ["--import", "tsx", script]);
  const raw = new DatabaseSync(path);
  expect(raw.prepare("SELECT revision FROM orbit_backup_outbox").all()).toEqual([{ revision: 1 }]);
  raw.close();
  const reopened = new OrbitDatabase(path, backups);
  try {
    await reopened.flushBackups();
    expect(reopened.get().revision).toBe(1);
    expect(reopened.maintenanceStatus().pendingBackups).toBe(0);
    expect(JSON.parse(await readFile(join(backups, "current.json"), "utf8")).revision).toBe(1);
  } finally { await reopened.close(); }
});

it("holt nach abruptem Ende zwischen dauerhaftem Export und SQL-Ack dieselbe Revision nach", async () => {
  const { directory, path, backups } = await fixture();
  const script = join(directory, "crash-after-export.mts");
  const databaseSource = new URL("./database.ts", import.meta.url).pathname;
  const writerSource = new URL("./backup-worker.ts", import.meta.url).pathname;
  await writeFile(script, `import { OrbitDatabase, createDefaultOrbitWorkspace } from ${JSON.stringify(databaseSource)};
    import { OrbitBackupWorker } from ${JSON.stringify(writerSource)};
    const worker = new OrbitBackupWorker(${JSON.stringify(backups)});
    const writer = { write: async item => { await worker.write(item); process.exit(0); },
      prune: async () => {}, close: async () => worker.close() };
    const db = new OrbitDatabase(${JSON.stringify(path)}, ${JSON.stringify(backups)}, { writer });
    db.save(createDefaultOrbitWorkspace(), 0); await db.flushBackups();`);
  await promisify(execFile)(process.execPath, ["--import", "tsx", script], { timeout: 10_000 });
  const durable = await readFile(join(backups, "current.json"), "utf8");
  expect(JSON.parse(durable).revision).toBe(1);
  const raw = new DatabaseSync(path);
  expect(raw.prepare("SELECT revision FROM orbit_backup_outbox").all()).toEqual([{ revision: 1 }]);
  raw.close();
  const reopened = new OrbitDatabase(path, backups);
  try {
    await reopened.flushBackups();
    expect(reopened.get().revision).toBe(1);
    expect(reopened.maintenanceStatus().pendingBackups).toBe(0);
    expect(await readFile(join(backups, "current.json"), "utf8")).toBe(durable);
  } finally { await reopened.close(); }
});
