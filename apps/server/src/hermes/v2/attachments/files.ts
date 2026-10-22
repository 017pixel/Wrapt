import { constants } from "node:fs";
import { lstat, realpath, open, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, relative, isAbsolute, sep } from "node:path";
import type { BigIntStats } from "node:fs";
import { GatewayError } from "../errors.js";
import type { OrganizationScope } from "../organization/scope.js";
import type { AttachmentRow } from "./store.js";

const fail = () => new GatewayError("PROJECT_FORBIDDEN", "Der Anhangspfad oder seine Dateiidentität ist nicht mehr bestätigt.");
const beneath = (root: string, path: string) => { const child = relative(root, path); return !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`); };
export const fingerprint = (stat: BigIntStats): string => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
export function quoteReference(path: string): string {
  if ([...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw fail();
  if (!/[\s()[\]{}<>"'`]/.test(path)) return path;
  for (const q of ["`", '"', "'"]) if (!path.includes(q)) return `${q}${path}${q}`;
  throw fail();
}
async function safeRoot(anchor: string, parts: string[]): Promise<string> {
  const root = await realpath(anchor);
  if (root !== anchor) throw fail();
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    try { const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail(); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
  }
  return path;
}
export async function stagingRoots(scope: OrganizationScope, cwd: string): Promise<string[]> {
  return Promise.all([safeRoot(scope.home, ["attachments"]), safeRoot(cwd, [".hermes", "attachments"])]);
}
export async function openChecked(row: Pick<AttachmentRow, "path"|"root"|"bytes"|"fingerprint">): Promise<FileHandle> {
  if (!row.path || !row.root || !isAbsolute(row.path) || !beneath(row.root, row.path)) throw fail();
  const [path, root] = await Promise.all([realpath(row.path), realpath(row.root)]);
  if (path !== row.path || root !== row.root || dirname(path) !== root) throw fail();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || Number(stat.size) !== row.bytes || (row.fingerprint !== null && fingerprint(stat) !== row.fingerprint)) throw fail();
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
export async function verifyStaged(value: { path: string; name: string; ref_path: string; ref_text: string }, generated: string,
  scope: OrganizationScope, cwd: string, bytes: Buffer): Promise<{ path: string; root: string; fingerprint: string; reference: string }> {
  if (!isAbsolute(value.path) || basename(value.path) !== generated || value.name !== generated) throw fail();
  const roots = await stagingRoots(scope, cwd);
  const path = await realpath(value.path);
  const root = roots.find((root) => dirname(path) === root);
  if (!root || value.path !== path || (isAbsolute(value.ref_path) ? value.ref_path : join(cwd, value.ref_path)) !== path
    || value.ref_text !== `@file:${quoteReference(value.ref_path)}`) throw fail();
  const handle = await openChecked({ path, root, bytes: bytes.length, fingerprint: null });
  try {
    const before = fingerprint(await handle.stat({ bigint: true }));
    const stored = await handle.readFile();
    const after = fingerprint(await handle.stat({ bigint: true }));
    if (!bytes.equals(stored) || before !== after) throw fail();
    return { path, root, fingerprint: before, reference: `@file:${quoteReference(path)}` };
  } finally { await handle.close(); }
}
