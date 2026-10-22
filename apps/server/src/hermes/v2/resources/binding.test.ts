import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

const lstat = fs.lstat;
describe("Frische Ressourcenbindung ohne Chatlease", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { fs.lstat = lstat; syncBuiltinESMExports(); await f.close(); });
  it("bestätigt einen während post-Native-HOME-lstat gewechselten Profilkontext nicht erneut", async () => {
    await fs.mkdir(join(f.root, "other")); let armed = false; let held = false;
    f.hook((_method, path) => { if (path.startsWith("/api/cron/jobs?")) armed = true; });
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => { const stat = await lstat(...args);
      if (armed && !held && String(args[0]) === f.root) { held = true; f.profile("other"); } return stat;
    }) as typeof fs.lstat; syncBuiltinESMExports();
    const result = await f.request("GET", "/cron/jobs"); expect(held).toBe(true); expect(result.statusCode).not.toBe(200); expect(result.body).not.toContain("Aufgabe"); expect(f.pool.existing()).toHaveLength(0);
  });
  it("erkennt dieselbe HOMEschreibweise mit ausgetauschter Verzeichnisidentität im letzten Profilawait", async () => {
    let armed = false; let swapped = false; const saved = `${f.root}-saved`;
    f.hook(async (_method, path) => {
      if (path.startsWith("/api/cron/jobs?")) armed = true;
      else if (armed && !swapped && path === "/api/profiles/active") { swapped = true; await fs.rename(f.root, saved); await fs.mkdir(f.root); }
    });
    try { const result = await f.request("GET", "/cron/jobs"); expect(swapped).toBe(true); expect(result.statusCode).not.toBe(200); expect(result.body).not.toContain("Aufgabe"); }
    finally { if (swapped) { await fs.rm(f.root, { recursive: true, force: true }); await fs.rename(saved, f.root); } }
  });
  it("erkennt CWDsymlinkwechsel im Profilawait vor Create ohne Send", async () => {
    const link = join(f.root, "project"); await fs.symlink(f.root, link); const scope = await f.scope(); let armed = false; let swapped = false;
    f.deps.resolveProjectCwd = async () => { armed = true; return link; };
    f.hook(async (_method, path) => { if (armed && !swapped && path === "/api/profiles/active") { swapped = true; await fs.unlink(link); await fs.symlink("/etc", link); } });
    const result = await f.request("POST", "/cron/jobs", { scope, name: "Test", prompt: "Aufgabe", schedule: "once", repeat: 1, paused: false, projectId: "wrapt" });
    expect(swapped).toBe(true); expect(result.statusCode).not.toBe(200); expect(f.writes).toHaveLength(0);
  });
  it("lässt durch beobachtete unbekannte Profilantwort keinen alten Scope wieder aufleben", async () => {
    const old = await f.scope(); f.hook((_method, path) => path === "/api/profiles/active" ? {} : undefined);
    expect((await f.request("GET", "/cron/jobs")).json().code).toBe("SOURCE_IDENTITY_UNKNOWN");
    f.hook(undefined); expect(await f.scope()).not.toBe(old);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: old })).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
  });
  it("stoppt bei Flagwechsel während eines echten Reads vor Ausgabe", async () => {
    f.hook((_method, path) => { if (path.startsWith("/api/memory?")) { f.deps.enabled = () => false; return { active: "privater Text", providers: [] }; } });
    const result = await f.request("GET", "/memory"); expect(result.statusCode).toBe(403); expect(result.body).not.toContain("privater Text");
  });
  it("bindet den HTTPscope an beobachtete HOME-Inoden und erhält A→B→A als neue Generation", async () => {
    const host = f.pool.resources!; const old = await f.scope(); const oldBinding = await host.context(); const saved = `${f.root}-saved`;
    let moved = false;
    try {
      await fs.rename(f.root, saved); moved = true; await fs.mkdir(f.root);
      const other = await f.scope(); expect(other).not.toBe(old);
      await fs.rm(f.root, { recursive: true }); await fs.rename(saved, f.root); moved = false;
      const fresh = await f.scope(); expect(fresh).not.toBe(old); expect(await f.scope()).toBe(fresh);
      await expect(oldBinding.current()).rejects.toMatchObject({ code: "STALE_RESOURCE_CONTEXT" });
      expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: old })).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
      expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: fresh })).statusCode).toBe(200);
    } finally { if (moved) { await fs.rm(f.root, { recursive: true, force: true }); await fs.rename(saved, f.root); } }
  });
});
