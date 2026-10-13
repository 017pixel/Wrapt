import { appendFile, mkdir, mkdtemp, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { CodexSessionReader, type CodexSessionBatch } from "./codex-session-reader.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(originator = "codex") {
  const root = await mkdtemp(join(tmpdir(), "codex-reader-"));
  roots.push(root);
  const path = join(root, "session.jsonl");
  await writeFile(path, `${JSON.stringify({ type: "session_meta", payload: { id: "session", cwd: "/fixture", originator } })}\n`);
  const offsets: Record<string, number> = {};
  const identities: Record<string, string> = {};
  const reader = new CodexSessionReader(root, { discoveryMilliseconds: 60_000, blockBytes: 4096, pollBytes: 65536, concurrency: 2 });
  const batches: CodexSessionBatch[] = [];
  const poll = (emit = true, signal?: AbortSignal) => reader.poll(offsets, identities, emit, (batch) => batches.push(batch), signal);
  return { root, path, reader, offsets, identities, batches, poll };
}

it.each([1, 10, 100])("liest bei %i MB Verlauf nach der Baseline nur den 4-KiB-Zuwachs", async (megabytes) => {
  const f = await fixture();
  const handle = await open(f.path, "r+");
  await handle.truncate(megabytes * 1024 * 1024);
  await handle.write(Buffer.from("\n"), 0, 1, megabytes * 1024 * 1024 - 1);
  const prototype = Object.getPrototypeOf(handle) as typeof handle;
  const read = vi.spyOn(prototype, "read");
  await handle.close();
  await f.poll(false);
  read.mockClear();
  const update = `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "new", text: "x".repeat(4000) } })}\n`;
  await appendFile(f.path, update);
  await f.poll();
  expect(f.batches.flatMap((batch) => batch.lines)).toHaveLength(1);
  const calls = read.mock.calls as unknown as Array<[Buffer, number, number, number]>;
  const byteCount = calls.reduce((total, args) => total + args[2], 0);
  expect(byteCount).toBe(Buffer.byteLength(update));
  expect(calls[0]?.[3]).toBe(megabytes * 1024 * 1024);
});

it("behält UTF-8-Teilbytes und Teilzeilen ohne doppelte Events über Polls und Neustart", async () => {
  const f = await fixture();
  await f.poll(false);
  const line = Buffer.from(`${JSON.stringify({ type: "event_msg", payload: { reason: "Grüße aus 東京" } })}\n`);
  const split = line.indexOf(Buffer.from("東")) + 1;
  await appendFile(f.path, line.subarray(0, split));
  const baseline = f.offsets[f.path];
  await f.poll();
  expect(f.offsets[f.path]).toBe(baseline);
  expect(f.batches.flatMap((batch) => batch.lines)).toHaveLength(0);
  await appendFile(f.path, line.subarray(split));
  const restarted = new CodexSessionReader(f.root);
  await restarted.poll(f.offsets, f.identities, true, (batch) => f.batches.push(batch));
  expect(f.batches.flatMap((batch) => batch.lines)).toEqual([{ type: "event_msg", payload: { reason: "Grüße aus 東京" } }]);
  await restarted.poll(f.offsets, f.identities, true, (batch) => f.batches.push(batch));
  expect(f.batches.flatMap((batch) => batch.lines)).toHaveLength(1);
});

it("schließt bekannte T3-Verläufe vor Zuwachsreads aus", async () => {
  const f = await fixture("t3code-worker");
  await f.poll(false);
  const handle = await open(f.path, "r");
  const read = vi.spyOn(Object.getPrototypeOf(handle) as typeof handle, "read");
  await handle.close();
  await appendFile(f.path, `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } })}\n`);
  await f.poll();
  expect(read).not.toHaveBeenCalled();
  expect(f.batches).toHaveLength(0);
});

it("setzt Rotation, Ersatz und Truncation auf eine stille Baseline zurück", async () => {
  const f = await fixture();
  await f.poll(false);
  const oldIdentity = f.identities[f.path];
  await rename(f.path, join(f.root, "rotated.old"));
  await writeFile(f.path, `${JSON.stringify({ type: "session_meta", payload: { id: "replacement" } })}\n{"old":true}\n`);
  await f.poll();
  expect(f.identities[f.path]).not.toBe(oldIdentity);
  expect(f.batches.flatMap((batch) => batch.lines)).toHaveLength(0);
  await appendFile(f.path, '{"new":true}\n');
  await f.poll();
  expect(f.batches.flatMap((batch) => batch.lines)).toEqual([{ new: true }]);
  await writeFile(f.path, '{"payload":{"id":"short"}}\n');
  await f.poll();
  await appendFile(f.path, '{"afterTruncate":true}\n');
  await f.poll();
  expect(f.batches.flatMap((batch) => batch.lines)).toEqual([{ new: true }, { afterTruncate: true }]);
});

it("entdeckt neue Dateien nach dem Kontrollintervall und committtet bei Verbrauchsfehler keinen Cursor", async () => {
  const f = await fixture();
  await f.poll(false);
  await mkdir(join(f.root, "new"));
  const added = join(f.root, "new", "second.jsonl");
  await writeFile(added, '{"payload":{"id":"second"}}\n');
  await f.poll();
  expect(f.offsets[added]).toBeUndefined();
  vi.useFakeTimers();
  vi.advanceTimersByTime(60_000);
  await f.poll();
  expect(f.offsets[added]).toBeGreaterThan(0);
  await appendFile(f.path, '{"retry":true}\n');
  const previous = f.offsets[f.path];
  await expect(f.reader.poll(f.offsets, f.identities, true, () => { throw new Error("consume failed"); })).rejects.toThrow("consume failed");
  expect(f.offsets[f.path]).toBe(previous);
  await f.poll();
  expect(f.batches.flatMap((batch) => batch.lines)).toContainEqual({ retry: true });
});

it("bricht bei Shutdown ohne Cursorvorsprung ab", async () => {
  const f = await fixture();
  await f.poll(false);
  await appendFile(f.path, '{"pending":true}\n');
  const previous = f.offsets[f.path];
  const abort = new AbortController();
  abort.abort();
  await expect(f.poll(true, abort.signal)).rejects.toThrow();
  expect(f.offsets[f.path]).toBe(previous);
});

it("liest Metadaten nach einer zunächst leeren Datei erneut und erkennt T3 früh", async () => {
  const f = await fixture();
  await writeFile(f.path, "");
  await f.poll(false);
  await appendFile(f.path, '{"type":"session_meta","payload":{"id":"neu","originator":"t3code-worker"}}\n');
  await f.poll();
  await appendFile(f.path, '{"type":"event_msg","payload":{"type":"task_complete"}}\n');
  await f.poll();
  expect(f.batches.flatMap((batch) => batch.lines)).toEqual([]);
  expect(f.offsets[f.path]).toBe((await stat(f.path)).size);
});
