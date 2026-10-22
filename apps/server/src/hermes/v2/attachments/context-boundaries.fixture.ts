import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { deferred, type awaitContextFixture } from "./await-context.fixture.js";

export type Boundary = "capture" | "stage-pre" | "stage-post" | "submit-pre" | "submit-post";
export type Fixture = Awaited<ReturnType<typeof awaitContextFixture>>;

/** Hält echte FS-Ergebnisse zurück, ohne Statwerte oder Produktguards zu ersetzen. */
export function holdBoundary(f: Fixture, phase: Boundary, filePath?: string | null) {
  const lstat = fs.lstat; const open = fs.open; const hook = f.core.resultHook!;
  const entered = deferred(); const release = deferred();
  let held = false; let attached = false; let submitted = false;
  f.core.resultHook = (method, params, raw) => {
    const result = hook(method, params, raw);
    if (method === "file.attach") attached = true;
    if (method === "prompt.submit") submitted = true;
    return result;
  };
  const hold = async () => { held = true; entered.resolve(); await release.promise; };
  fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
    const value = await lstat(...args); const path = String(args[0]);
    if (!held && ((phase === "capture" && path === f.home)
      || (phase === "stage-pre" && path === join(f.cwd, ".hermes", "attachments"))
      || (phase === "stage-post" && attached && path === f.home)
      || (phase === "submit-post" && submitted && path === f.home))) await hold();
    return value;
  }) as typeof fs.lstat;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (!held && phase === "submit-pre" && String(args[0]) === filePath) await hold();
    return handle;
  }) as typeof fs.open;
  syncBuiltinESMExports();
  return { entered: entered.promise, release: release.resolve, restore: () => {
    release.resolve(); fs.lstat = lstat; fs.open = open; f.core.resultHook = hook; syncBuiltinESMExports();
  } };
}

export async function readyFile(f: Fixture) {
  const response = await f.upload(f.client, f.session.id, Buffer.from("Eigene Grenzbytes"));
  if (response.statusCode !== 200) throw new Error(response.body);
  return f.service.store.byId("a", f.binding.scope.id, response.json().attachment.id);
}
export function associations(f: Fixture, id: string) {
  return f.pool.organization!.repo.all<{ user_row: number }>(
    "SELECT user_row FROM hermes_v2_attachment_messages WHERE attachment_id=? ORDER BY user_row", id).map((row) => row.user_row);
}
