import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { ResourceContext } from "./context.js";
import { resourcePolicy } from "./policy.js";

interface FileRead { raw: string | null; status: "available" | "empty" | "missing" | "unreadable" | "unknown"; bytes: number | null; truncated: boolean }
const identity = (stat: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }) =>
  JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]);
async function directories(binding: ResourceContext, segments: readonly string[]) {
  const paths = [binding.scope.home]; for (const name of segments) paths.push(join(paths.at(-1)!, name));
  const proofs = [];
  for (const path of paths) {
    binding.assert(); const stat = await lstat(path); binding.assert();
    const resolved = await realpath(path); binding.assert();
    if (!stat.isDirectory() || stat.isSymbolicLink() || resolved !== path) throw new Error("Unsicherer Ressourcenpfad");
    proofs.push({ path, dev: stat.dev, ino: stat.ino });
  }
  return proofs;
}
async function verify(binding: ResourceContext, proofs: Awaited<ReturnType<typeof directories>>) {
  for (const proof of proofs) {
    const stat = await lstat(proof.path); binding.assert();
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.dev !== proof.dev || stat.ino !== proof.ino) throw new Error("Ressourcenpfad geändert");
  }
}
export async function readResourceFile(binding: ResourceContext, segments: readonly string[], name: string): Promise<FileRead> {
  let started = false;
  try {
    const parents = await directories(binding, segments); const path = join(parents.at(-1)!.path, name);
    const before = await lstat(path); binding.assert(); started = true;
    if (!before.isFile() || before.isSymbolicLink()) throw new Error("Keine reguläre Ressourcendatei");
    let handle;
    try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && ["EACCES", "EPERM"].includes(String(error.code))) {
        await verify(binding, parents); const after = await lstat(path); binding.assert(); await binding.current();
        if (after.isFile() && !after.isSymbolicLink() && identity(after) === identity(before))
          return { raw: null, status: "unreadable", bytes: null, truncated: false };
      }
      throw error;
    }
    try {
      binding.assert();
      const opened = await handle.stat(); binding.assert();
      if (!opened.isFile() || identity(opened) !== identity(before)) throw new Error("Ressourcendatei geändert");
      const buffer = Buffer.alloc(resourcePolicy.fileBytes + 1);
      let read = 0;
      while (read < buffer.length) {
        const chunk = await handle.read(buffer, read, buffer.length - read, read); binding.assert();
        if (!chunk.bytesRead) break; read += chunk.bytesRead;
      }
      const after = await handle.stat(); binding.assert();
      const linked = await lstat(path); binding.assert();
      await verify(binding, parents);
      if (identity(after) !== identity(opened) || identity(linked) !== identity(opened) || linked.isSymbolicLink()) throw new Error("Ressourcendatei geändert");
      await binding.current();
      const raw = new TextDecoder().decode(buffer.subarray(0, Math.min(read, resourcePolicy.fileBytes)), { stream: read > resourcePolicy.fileBytes });
      return { raw, status: read ? "available" : "empty", bytes: after.size, truncated: read > resourcePolicy.fileBytes };
    } finally { await handle.close(); }
  } catch (error) {
    binding.assert(); await binding.current();
    const missing = !started && error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    return { raw: null, status: missing ? "missing" : started ? "unknown" : "unreadable", bytes: null, truncated: false };
  }
}
export async function pendingNames(binding: ResourceContext, subsystem: "memory" | "skills") {
  try {
    const parents = await directories(binding, ["pending", subsystem]);
    const dir = await opendir(parents.at(-1)!.path); const names: string[] = []; let partial = false; let scanned = 0;
    try {
      for await (const entry of dir) {
        binding.assert();
        if (++scanned > resourcePolicy.pendingRecords * 2) { partial = true; break; }
        if (/^[a-f0-9]{8}\.json$/.test(entry.name)) names.push(entry.name);
        else partial = true;
        if (names.length > resourcePolicy.pendingRecords) { partial = true; break; }
      }
    } finally { await dir.close().catch(() => {}); }
    await verify(binding, parents); await binding.current();
    return { names, partial };
  } catch (error) {
    binding.assert(); await binding.current();
    return { names: [], partial: !(error && typeof error === "object" && "code" in error && error.code === "ENOENT") };
  }
}
