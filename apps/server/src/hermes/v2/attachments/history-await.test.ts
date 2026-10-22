import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import type { HermesV2Message, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitContextFixture, deferred } from "./await-context.fixture.js";

function rows(result: HermesV2ServerMessage): HermesV2Message[] {
  expect(result.type).toBe("result");
  return result.type === "result" ? result.op === "history.read" ? result.data.messages
    : result.op === "session.subscribe" ? result.data.snapshot.messages : [] : [];
}
describe("R2-M2: dieselbe eingefrorene Historyquelle für Karten und Organisationsbelege", () => {
  let f: Awaited<ReturnType<typeof awaitContextFixture>>;
  const original = fs.lstat;
  beforeEach(async () => { f = await awaitContextFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  it.each(["history.read", "session.subscribe"] as const)("%s bindet verzögerte fremde Seite niemals an den späteren Scope", async (op) => {
    const file = f.reserve(); const ready = await f.service.stage(f.binding, file, Buffer.from("Test"), new AbortController().signal);
    await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Test", attachmentIds: [ready.attachment!.id] });
    const uid = "b".repeat(32); f.session.messages[0]!.message_uid = uid;
    const pin = () => f.pool.organization!.repo.one<{ logical_uid: string | null }>(
      "SELECT logical_uid FROM hermes_v2_attachment_messages WHERE attachment_id=? AND user_row=1", file.id)!.logical_uid;
    await f.selectHome(f.other);
    const entered = deferred(); const release = deferred();
    f.page(async (path) => {
      if (!path.includes("/messages?")) return undefined;
      const page = { session_id: f.session.id, profile: "default", messages: [{ id: 1, role: "user", content: "Fremde Seite", message_uid: "a".repeat(32) }] };
      entered.resolve(); await release.promise; return page;
    });
    const pending = f.client.run({ op, sessionId: f.session.id });
    try {
      await entered.promise; await f.selectHome(f.home); release.resolve();
      expect(rows(await pending).some((row) => row.attachments?.length)).toBe(false); expect(pin()).toBeNull();
    } finally { release.resolve(); }
    f.page(undefined);
    expect(rows(await f.client.run({ op, sessionId: f.session.id })).some((row) => row.attachments?.[0]?.id === file.id)).toBe(true);
    expect(pin()).toBe(uid);
  });
  it.each(["same", "other", "return"] as const)("Seitenread mit Kontextbestätigung %s unterscheidet gleiche Quelle und echten A-B-A-Wechsel", async (change) => {
    const file = f.reserve(); const ready = await f.service.stage(f.binding, file, Buffer.from("Test"), new AbortController().signal);
    await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Test", attachmentIds: [ready.attachment!.id] });
    const uid = "b".repeat(32); f.session.messages[0]!.message_uid = uid;
    const entered = deferred(); const release = deferred();
    f.page(async (path) => { if (!path.includes("/messages?")) return undefined;
      entered.resolve(); await release.promise; return { session_id: f.session.id, profile: "default",
        messages: [{ id: 1, role: "user", content: "Gültige Quellseite", message_uid: uid }] }; });
    const pending = f.client.run({ op: "history.read", sessionId: f.session.id });
    try {
      await entered.promise;
      if (change !== "same") await f.selectHome(f.other);
      if (change !== "other") await f.selectHome(f.home);
      release.resolve();
      expect(rows(await pending).some((row) => row.attachments?.length)).toBe(change === "same");
      expect(f.pool.organization!.repo.one<{ logical_uid: string | null }>(
        "SELECT logical_uid FROM hermes_v2_attachment_messages WHERE attachment_id=?", file.id)!.logical_uid).toBe(change === "same" ? uid : null);
    } finally { release.resolve(); }
  });
  it.each([false, true])("Scopewechsel im Attachmentcallback-Await=%s erreicht keine neue Organisationsquelle", async (changed) => {
    f.session.messages.push({ id: 99, role: "assistant", content: "Eigene Antwort", finish_reason: "stop", message_uid: "c".repeat(32) });
    const entered = deferred(); const release = deferred(); let homes = 0;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      // Erster Check nach REST; zweiter Check gehört dem Attachmentcallback.
      if (String(args[0]) === f.home && ++homes === 2) { entered.resolve(); await release.promise; }
      return stat;
    }) as typeof fs.lstat;
    syncBuiltinESMExports();
    const pending = f.client.run({ op: "history.read", sessionId: f.session.id });
    try {
      await entered.promise; const scope = changed ? await f.selectHome(f.other) : f.binding.scope;
      release.resolve(); const result = await pending;
      const witness = f.pool.organization!.repo.one<{ uid: string }>(
        "SELECT uid FROM hermes_v2_row_witnesses WHERE scope=? AND session_id=? AND row_id=99", scope.id, f.session.id);
      if (changed) { expect(witness).toBeUndefined(); expect(rows(result)[0]?.readEvidence).toBeNull(); }
      else { expect(witness?.uid).toBe("c".repeat(32)); expect(rows(result)[0]?.readEvidence).toBeTypeOf("string"); }
    } finally { release.resolve(); }
  });
});
