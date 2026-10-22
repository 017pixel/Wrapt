import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";
import { AttachmentStore } from "./store.js";
import { attachmentPolicy as p } from "./policy.js";
import type { HermesV2Message } from "@wrapt/contracts/hermes-v2";
import { normalizeHistory } from "../normalize-history.js";

describe("Anhangsmetadaten: CAS, Neustart, TTL und positive Identität", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function context() {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const binding = await f.pool.attachments!.capture("a", browser.id, session.id);
    let now = Date.now(); const store = new AttachmentStore(f.pool.organization!.repo, () => now);
    const reserve = () => store.reserve("a", randomUUID(), binding, "datei.txt", "text/plain").row;
    return { binding, browser, store, reserve, advance: (ms: number) => { now += ms; } };
  }
  it("später fail/ready kann einen abgeschlossenen CAS nicht überschreiben; Neustart macht receiving explizit unknown", async () => {
    const { store, reserve } = await context(); const first = reserve();
    store.ready(first, 1, "/native/datei", "/native", "fingerprint", "@file:/native/datei");
    store.fail(first, "not_sent"); expect(store.get("a", first.upload_id)?.state).toBe("ready");
    expect(() => store.ready(first, 2, "/x", "/", "x", "@file:/x")).toThrow();
    const interrupted = reserve();
    const reopened = new AttachmentStore(f.pool.organization!.repo);
    expect(reopened.get("a", interrupted.upload_id)?.state).toBe("unknown");
    expect(reopened.get("a", first.upload_id)?.state).toBe("ready");
  });
  it("ungenutzte Metadaten verfallen nach 24 Stunden, explizit verwendete erst nach 90 Tagen", async () => {
    const { binding, store, reserve, advance } = await context(); const unused = reserve(); const used = reserve();
    for (const row of [unused, used]) store.ready(row, 1, "/native/datei", "/native", "fp", "@file:/native/datei");
    store.used("a", [used.id], 12); advance(p.unusedMs + 1);
    expect(() => store.byId("a", binding.scope.id, unused.id)).toThrow();
    expect(store.byId("a", binding.scope.id, used.id).id).toBe(used.id);
    advance(p.usedMs); expect(() => store.byId("a", binding.scope.id, used.id)).toThrow();
  });
  it("Row-UID-Wechsel, falscher Owner und fehlender positiver Receipt erzeugen keine Karten", async () => {
    const { binding, browser, store, reserve } = await context(); const file = reserve();
    store.ready(file, 1, "/native/datei", "/native", "fp", "@file:/native/datei");
    const rows = (uid: string): HermesV2Message[] => normalizeHistory([{ id: 12, role: "user", content: "gleich", message_uid: uid }], "session", 0, browser.manager.secrets);
    const uid = "a".repeat(32); const other = "b".repeat(32);
    store.used("a", [file.id], null);
    const unknown = rows(uid); store.history("a", binding.scope.id, binding.canonical, unknown); expect(unknown[0]?.attachments).toBeUndefined();
    store.used("a", [file.id], 12);
    const own = rows(uid); store.history("a", binding.scope.id, binding.canonical, own); expect(own[0]?.attachments?.[0]?.id).toBe(file.id);
    for (const [owner, scope, canonical, row] of [["b", binding.scope.id, binding.canonical, rows(uid)],
      ["a", "anderer-scope", binding.canonical, rows(uid)], ["a", binding.scope.id, "andere-session", rows(uid)],
      ["a", binding.scope.id, binding.canonical, rows(other)]] as const) {
      store.history(owner, scope, canonical, row); expect(row[0]?.attachments).toBeUndefined();
    }
  });
  it("pending Kapazität ist begrenzt; fehlgeschlagene Reservierungen geben sie frei", async () => {
    const { store, reserve } = await context(); const rows = Array.from({ length: p.pendingOwner }, reserve);
    expect(reserve).toThrow(); store.fail(rows[0]!, "not_sent"); expect(reserve).not.toThrow();
  });
});
