import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deferred } from "../attachments/await-context.fixture.js";
import { workFixture } from "./test.fixture.js";

describe("Workbindung an tatsächlichen Await- und Sendgrenzen", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  const original = fs.lstat;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  const cases = ["same", "other", "return", "flag", "profile", "null", "cwd", "generation", "readonly", "optout", "home", "transport", "connection", "profile-return", "cwd-return"] as const;
  async function change(kind: typeof cases[number]) {
    const manager = f.client.manager; const record = manager.sessions.records.get(f.session.id)!;
    if (kind === "same") await f.selectHome(f.home);
    if (kind === "other" || kind === "return") await f.selectHome(f.other);
    if (kind === "return") await f.selectHome(f.home);
    if (kind === "flag") f.deps.enabled = () => false;
    if (kind === "profile" || kind === "null") {
      const profile = kind === "profile" ? "anderes-profil" : null;
      f.event("session.info", { profile_name: profile });
      await expect.poll(() => record.profileName).toBe(profile);
    }
    if (kind === "cwd") {
      f.event("session.info", { cwd: f.other });
      await expect.poll(() => record.snapshot.session.cwd).toBe(f.other);
    }
    if (kind === "generation") { manager.subscriptions.detach(f.client.id, f.session.id); manager.subscriptions.attach(f.client.id, f.session.id); }
    if (kind === "readonly") record.snapshot.writable = false;
    if (kind === "optout") manager.connections.get(f.client.id)!.work = false;
    if (kind === "home") f.changeHome();
    if (kind === "transport") {
      const transport = manager.upstream.transportId; f.core.disconnect();
      await expect.poll(() => manager.upstream.transportId).not.toBe(transport);
    }
    if (kind === "connection") manager.connections.set(f.client.id, { ...manager.connections.get(f.client.id)! });
    if (kind === "profile-return" || kind === "cwd-return") {
      const revision = record.contextRevision ?? 0;
      f.event("session.info", kind === "profile-return" ? { profile_name: "anderes-profil" } : { cwd: f.other });
      f.event("session.info", kind === "profile-return" ? { profile_name: "default" } : { cwd: f.cwd });
      await expect.poll(() => record.contextRevision).toBe(revision + 2);
    }
  }
  function hold(after: string) {
    const entered = deferred(); const release = deferred(); const hook = f.core.resultHook!; let ready = false; let held = false;
    f.core.resultHook = (method, params, raw) => { const value = hook(method, params, raw); if (method === after) ready = true; return value; };
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      if (ready && String(args[0]) === f.home && !held) { held = true; entered.resolve(); await release.promise; }
      return stat;
    }) as typeof fs.lstat;
    syncBuiltinESMExports(); return { entered, release };
  }
  it.each(cases)("%s nach frischem Roster vor Interrupt bleibt an derselben Generation", async (kind) => {
    f.children.push({ subagent_id: "kind", status: "running" }); const gate = hold("subagent.list");
    const pending = f.client.run({ op: "work.subagent.interrupt", sessionId: f.session.id, subagentId: "kind" });
    try {
      await gate.entered.promise; await change(kind); gate.release.resolve();
      expect(await pending).toMatchObject(kind === "same" ? { type: "result", data: { found: false } } : { type: "error", outcome: "not_sent" });
      expect(f.count("subagent.interrupt")).toBe(kind === "same" ? 1 : 0);
    } finally { gate.release.resolve(); }
  });
  it.each(cases)("%s im Nachsend-HOME-Await ergibt nur bei gleicher Bindung einen Erfolg", async (kind) => {
    f.children.push({ subagent_id: "kind", status: "running" }); const gate = hold("subagent.interrupt");
    const pending = f.client.run({ op: "work.subagent.interrupt", sessionId: f.session.id, subagentId: "kind" });
    try {
      await gate.entered.promise; await change(kind); gate.release.resolve();
      expect(await pending).toMatchObject(kind === "same" ? { type: "result", data: { found: false } } : { type: "error", outcome: "unknown" });
      expect(f.count("subagent.interrupt")).toBe(1);
      if (kind !== "same") expect(f.client.manager.retainRuntime).toBe(true);
    } finally { gate.release.resolve(); }
  });
  it("zwei gleichzeitige Reads teilen einen nativen Roster; Stop bleibt während des Reads erreichbar", async () => {
    const gate = hold("subagent.list"); const calls = f.count("subagent.list");
    const first = f.run(); const second = f.run();
    try {
      await gate.entered.promise;
      expect(f.count("subagent.list") - calls).toBe(1);
      expect(await f.client.run({ op: "session.stop", sessionId: f.session.id })).toMatchObject({ type: "result", op: "session.stop" });
      gate.release.resolve();
      expect(await first).toMatchObject({ type: "error", code: "STALE_REQUEST" });
      expect(await second).toMatchObject({ type: "error", code: "STALE_REQUEST" });
      expect(f.count("session.interrupt")).toBe(1);
    } finally { gate.release.resolve(); }
  });
  it("neueres strukturiertes Event verhindert Überschreiben durch einen alten vollständigen Read", async () => {
    const gate = hold("subagent.list"); const pending = f.run();
    try {
      await gate.entered.promise; f.event("subagent.start", { subagent_id: "neu", goal: "Neuer Beleg" });
      await expect.poll(() => f.client.manager.work.state.get(f.client.manager.sessions.records.get(f.session.id)!).subagents.has("neu")).toBe(true);
      gate.release.resolve(); expect(await pending).toMatchObject({ type: "error", code: "STALE_REQUEST" });
      expect((await f.read()).subagents[0]?.goal).toBe("Neuer Beleg");
    } finally { gate.release.resolve(); }
  });
});
