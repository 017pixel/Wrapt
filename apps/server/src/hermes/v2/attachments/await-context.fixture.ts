import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { composerFixture } from "../phase6-test.fixture.js";

export function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
export async function awaitContextFixture() {
  const f = await composerFixture();
  const home = join(f.root, "profil"); const other = join(f.root, "anderes-home"); const cwd = join(f.root, "workspace");
  const saved = join(f.root, "original-home");
  await Promise.all([mkdir(join(home, "attachments"), { recursive: true }), mkdir(other),
    mkdir(join(cwd, ".hermes", "attachments"), { recursive: true })]);
  let selected = home;
  let page: ((path: string) => unknown | Promise<unknown>) | undefined;
  f.custom((path) => path === "/api/profiles" ? { profiles: [{ name: "default", path: selected }] } : page?.(path));
  const hook = f.core.resultHook!;
  f.core.resultHook = (method, params, raw) => {
    if (method !== "file.attach") return hook(method, params, raw);
    const root = join(realpathSync(selected), "attachments"); mkdirSync(root, { recursive: true });
    const name = String(params.name); const path = join(root, name);
    writeFileSync(path, Buffer.from(String(params.data_url).split(",")[1]!, "base64"), { flag: "wx" });
    return { attached: true, uploaded: true, name, path, ref_path: path, ref_text: `@file:${path}` };
  };
  const session = f.core.seed("await-session"); session.cwd = cwd; const client = f.browser();
  await client.run({ op: "session.subscribe", sessionId: session.id });
  const service = f.pool.attachments!; const binding = await service.capture("a", client.id, session.id);
  const reserve = () => service.reserve("a", randomUUID(), binding, "probe.txt", "text/plain").row;
  const selectHome = async (value: string) => {
    selected = value; f.pool.organization!.scopes.invalidate(); return f.pool.organization!.context();
  };
  return { ...f, home, other, cwd, saved, session, client, service, binding, reserve, selectHome,
    page: (reader: typeof page) => { page = reader; },
    changeHome: () => { renameSync(home, saved); symlinkSync(other, home); },
    count: (method: string) => f.core.calls.filter((call) => call.method === method).length };
}
