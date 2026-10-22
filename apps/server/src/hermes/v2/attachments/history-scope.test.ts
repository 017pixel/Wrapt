import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";

describe("M2: Historyprojektion und UID-Pinning verwenden die tatsächliche Seitenidentität", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function context() {
    const session = f.core.seed("history-session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const upload = await f.upload(browser, session.id); expect(upload.statusCode).toBe(200); const id = upload.json().attachment.id as string;
    const receipt = await browser.run({ op: "message.submit", sessionId: session.id, text: "Eigene Nachricht", attachmentIds: [id] });
    expect(receipt).toMatchObject({ type: "result", data: { userRowId: 1 } });
    const uid = "b".repeat(32); session.messages[0]!.message_uid = uid;
    const pinned = () => f.pool.organization!.repo.one<{ logical_uid: string | null }>(
      "SELECT logical_uid FROM hermes_v2_attachment_messages WHERE attachment_id=? AND user_row=1", id)!.logical_uid;
    return { session, browser, id, uid, pinned };
  }
  it.each(["anderes-profil", undefined])("Seitenprofil %s erzeugt weder Karte noch UIDpersistenz; korrekter späterer Read funktioniert", async (profile) => {
    const c = await context();
    f.custom((path) => path.startsWith(`/api/sessions/${c.session.id}/messages?`) ? {
      session_id: c.session.id, profile, messages: [{ id: 1, role: "user", content: "Andere Quelle", message_uid: "a".repeat(32) }],
    } : undefined);
    const wrong = await c.browser.run({ op: "history.read", sessionId: c.session.id });
    expect(wrong).toMatchObject({ type: "result", op: "history.read" });
    expect(JSON.stringify(wrong)).not.toContain('"attachments"'); expect(c.pinned()).toBeNull();
    f.custom(undefined);
    const valid = await c.browser.run({ op: "history.read", sessionId: c.session.id });
    expect(valid).toMatchObject({ type: "result", data: { messages: [{ attachments: [{ id: c.id }] }] } });
    expect(c.pinned()).toBe(c.uid);
    const other = f.browser("b"); await other.run({ op: "session.subscribe", sessionId: c.session.id });
    expect(JSON.stringify(await other.run({ op: "history.read", sessionId: c.session.id }))).not.toContain('"attachments"');
  });
  it.each(["anderes-profil", undefined])("auch Subscribe/Snapshot bindet UID nicht an Seitenprofil %s", async (profile) => {
    const c = await context();
    f.custom((path) => path.startsWith(`/api/sessions/${c.session.id}/messages?`) ? { session_id: c.session.id, profile,
      messages: [{ id: 1, role: "user", content: "Andere Quelle", message_uid: "a".repeat(32) }] } : undefined);
    const snapshot = await c.browser.run({ op: "session.subscribe", sessionId: c.session.id });
    expect(snapshot).toMatchObject({ type: "result", op: "session.subscribe" });
    expect(JSON.stringify(snapshot)).not.toContain('"attachments"'); expect(c.pinned()).toBeNull();
    f.custom(undefined);
    const correct = await c.browser.run({ op: "session.subscribe", sessionId: c.session.id });
    expect(correct).toMatchObject({ type: "result", data: { snapshot: { messages: [{ attachments: [{ id: c.id }] }] } } });
    expect(c.pinned()).toBe(c.uid);
  });
  it("bereits korrekt gepinnte UID rechtfertigt keine Karte auf einer anderen Profilseite mit derselben Row/UID", async () => {
    const c = await context(); await c.browser.run({ op: "history.read", sessionId: c.session.id }); expect(c.pinned()).toBe(c.uid);
    f.custom((path) => path.startsWith(`/api/sessions/${c.session.id}/messages?`) ? { session_id: c.session.id, profile: "anderes-profil",
      messages: [{ id: 1, role: "user", content: "Andere Quelle", message_uid: c.uid }] } : undefined);
    expect(JSON.stringify(await c.browser.run({ op: "history.read", sessionId: c.session.id }))).not.toContain('"attachments"');
    expect(c.pinned()).toBe(c.uid);
  });
});
