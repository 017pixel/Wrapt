import { createHash } from "node:crypto";
import { open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { orbitWorkspaceSchema } from "@wrapt/contracts";

/** @param {string} path @param {string} content */
async function durableWrite(path, content) {
  const handle = await open(path, "w", 0o600);
  try { await handle.writeFile(content, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

/** @param {{revision: number, updatedAt: string, documentJson: string}} item */
async function write(item) {
  const raw = JSON.parse(item.documentJson);
  const document = orbitWorkspaceSchema.parse(raw.version === 4 || raw.version === 5 ? {
    ...raw, version: 6,
    boards: raw.boards?.map(/** @param {{nodes?: Record<string, unknown>[]}} board */ (board) => ({ ...board,
      nodes: board.nodes?.map((node) => ({ assetId: null, assetMimeType: null, assetBytes: null, ...node })) })),
  } : raw);
  const content = JSON.stringify({ formatVersion: 1, revision: item.revision, updatedAt: item.updatedAt,
    sha256: createHash("sha256").update(JSON.stringify(document)).digest("hex"), document });
  const revisionPath = join(workerData.directory, `orbit-r${String(item.revision).padStart(12, "0")}.json`);
  const temporary = join(workerData.directory, `.revision-${process.pid}-${item.revision}.tmp`);
  // Auch ein beim Crash hinterlassenes oder beschädigtes Revisionsfile wird atomar ersetzt.
  await durableWrite(temporary, content);
  await rename(temporary, revisionPath);
  const currentPath = join(workerData.directory, "current.json");
  let currentRevision = 0;
  try {
    const current = JSON.parse(await readFile(currentPath, "utf8"));
    if (current.sha256 === createHash("sha256").update(JSON.stringify(current.document)).digest("hex")) currentRevision = current.revision;
  } catch (error) {
    if (!(error instanceof SyntaxError) && /** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error;
  }
  if (item.revision >= currentRevision) {
    const currentTemporary = join(workerData.directory, `.current-${process.pid}-${item.revision}.tmp`);
    await durableWrite(currentTemporary, content);
    await rename(currentTemporary, currentPath);
  }
  const directory = await open(workerData.directory, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

/** @param {{minimumRevision: number, pending: number[]}} input */
async function prune(input) {
  const pending = new Set(input.pending);
  for (const name of await readdir(workerData.directory)) {
    const match = /^orbit-r(\d{12})\.json$/.exec(name);
    if (match && Number(match[1]) < input.minimumRevision && !pending.has(Number(match[1]))) {
      try { await unlink(join(workerData.directory, name)); }
      catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error; }
    }
  }
}

parentPort?.on("message", async (message) => {
  try {
    if (message.type === "write") await write(message.item);
    else await prune(message);
    parentPort?.postMessage({ ok: true });
  } catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : "Backupfehler" }); }
});
