// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, row, settle } from "./chat-test-fixtures";
import { composerSnapshot, TestUploads } from "./chat-composer-test-fixtures";

describe("Ownergebundene Dateivorgänge und Submitbelege", () => {
  let runtime: ChatRuntime, gateway: TestGateway, uploads: TestUploads;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = (id = "one") => runtime.actionsFor(id);
  const view = (id = "one") => runtime.owners.getView(id);
  const file = () => new File(["Inhalt"], "beispiel.txt", { type: "text/plain" });
  const attachment = () => view().composer.attachments[0]!;
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); gateway.composer = true; gateway.snapshots.set("a", composerSnapshot());
    uploads = new TestUploads(); runtime = new ChatRuntime(gateway.createClient(), uploads.client()); runtime.acquire(owner); await settle();
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("sendet unmittelbar nur file und tatsächliche Serververbindungs-/Upload-IDs", async () => {
    await actions().uploadAttachment(file());
    expect(uploads.calls).toHaveLength(1);
    expect(uploads.calls[0]).toMatchObject({ method: "POST", sessionId: "a", connectionId: gateway.socket.connectionId, parts: ["file"] });
    expect(uploads.calls[0]!.uploadId).toBe(attachment().uploadId);
    expect(attachment()).toMatchObject({ name: "beispiel.txt", status: "ready", attachment: { kind: "file-reference", bytes: 6 } });
    expect(JSON.stringify(runtime.owners.capture("one").draft)).not.toContain("Inhalt");
    expect(attachment()).not.toHaveProperty("binding"); expect(attachment()).not.toHaveProperty("file");
  });
  it.each([0, 4 * 1024 * 1024 + 1])("verwirft %s Bytes ohne Request oder Uploadmetadaten", async (bytes) => {
    await actions().uploadAttachment(new File([new Uint8Array(bytes)], "gross"));
    expect(uploads.calls).toHaveLength(0); expect(view().composer.attachments).toHaveLength(0);
    expect(view().actionError?.code).toBe("ATTACHMENT_SIZE");
  });
  it("begrenzt zehn Dateien und sendet keine elfte", async () => {
    for (let index = 0; index < 11; index++) await actions().uploadAttachment(file());
    expect(uploads.calls).toHaveLength(10); expect(view().composer.attachments).toHaveLength(10);
    expect(view().actionError?.code).toBe("ATTACHMENT_LIMIT");
  });
  it("verhindert parallele Uploadversuche ohne zweite zufällige ID", async () => {
    let finish!: (value: Response) => void;
    uploads.handle = () => new Promise((resolve) => { finish = resolve; });
    const first = actions().uploadAttachment(file()); await settle(); await actions().uploadAttachment(file());
    expect(uploads.calls).toHaveLength(1); expect(view().composer.attachments).toHaveLength(1);
    finish(uploads.result(uploads.statuses.get(attachment().uploadId))); await first;
    expect(attachment().status).toBe("ready");
  });
  it("erlaubt leeren Text mit ready IDs und projiziert Metadaten nur auf die belegte Userrow", async () => {
    await actions().uploadAttachment(file()); const metadata = attachment().attachment!;
    gateway.handle = (frame, socket) => { if (frame.op !== "message.submit") return false; socket.result(frame, { status: "streaming", userRowId: 42 }); return true; };
    await actions().submit();
    expect(gateway.sent.find((frame) => frame.op === "message.submit")).toMatchObject({ text: "", attachmentIds: [metadata.id] });
    expect(runtime.store.get("a").messages.find((message) => message.rowId === 42)).toMatchObject({ role: "user", attachments: [metadata] });
    expect(view().composer.attachments).toHaveLength(0);
  });
  it.each(["receiving", "unknown", "not_sent"] as const)("sendet mit %s nicht und verlangt Entfernen oder explizite Prüfung", async (state) => {
    uploads.handle = (call) => uploads.result({ uploadId: call.uploadId, state, attachment: null });
    await actions().uploadAttachment(file()); actions().setDraft("Text"); await actions().submit();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
    expect(view().draft).toBe("Text"); expect(view().actionError?.code).toBe("ATTACHMENT_UNCONFIRMED");
  });
  it("prüft TTL auch ohne Timer-/Tokenereignis direkt beim Submit", async () => {
    await actions().uploadAttachment(file()); vi.setSystemTime(attachment().attachment!.expiresAt + 1);
    await actions().submit("Text"); expect(gateway.sent.some((frame) => frame.op === "message.submit")).toBe(false);
  });
  it("verlorene POSTantwort behält UUID; bewusste Klärung nutzt GET ohne Wiederupload", async () => {
    uploads.handle = (call) => { if (call.method === "POST") throw new Error("lost"); return null; };
    await actions().uploadAttachment(file()); const id = attachment().uploadId;
    expect(attachment().status).toBe("unknown"); await actions().checkUpload(id);
    expect(uploads.calls.map((call) => call.method)).toEqual(["POST", "GET"]);
    expect(uploads.calls[1]!.uploadId).toBe(id); expect(attachment().status).toBe("ready");
    await actions().submit(); expect(gateway.sent.find((frame) => frame.op === "message.submit")).toHaveProperty("attachmentIds");
  });
  it("ein fehlgeschlagener GET erklärt den ursprünglichen POST nicht für ungesendet", async () => {
    uploads.handle = () => { throw new Error("lost"); };
    await actions().uploadAttachment(file()); await actions().checkUpload(attachment().uploadId);
    expect(attachment().status).toBe("unknown"); expect(uploads.calls.map((call) => call.method)).toEqual(["POST", "GET"]);
  });
  it("Annahme leert nur Originaldateien und opfert weder neuen eigenen noch fremden Draft", async () => {
    runtime.acquire({ ...owner, ownerId: "two" }); await settle();
    await actions().uploadAttachment(file()); await actions("two").uploadAttachment(file());
    actions().setDraft("Alt"); let held!: HermesV2ClientMessage;
    gateway.handle = (frame) => { if (frame.op !== "message.submit") return false; held = frame; return true; };
    const sending = actions().submit(); await settle();
    actions().setDraft("Neu"); await actions().uploadAttachment(file());
    const newer = view().composer.attachments.at(-1)!.uploadId;
    gateway.socket.result(held, { status: "streaming", userRowId: 42 }); await sending;
    expect(view().draft).toBe("Neu"); expect(view().composer.attachments.map((entry) => entry.uploadId)).toEqual([newer]);
    expect(view("two").composer.attachments).toHaveLength(1);
  });
  it("queued Annahme entfernt eigene Optimistik, nie eine echte Fremdrow", async () => {
    await actions().uploadAttachment(file());
    gateway.handle = (frame, socket) => { if (frame.op !== "message.submit") return false; socket.result(frame, { status: "queued", userRowId: null }); return true; };
    await actions().submit("Später", "queue");
    expect(runtime.store.get("a").messages.filter((message) => message.id.startsWith("live:user:"))).toHaveLength(0);
    expect(view().composer.attachments).toHaveLength(0);
  });
  it("Historyanhänge werden nur als echte Metadaten übernommen, gleiche Texte bleiben getrennt", async () => {
    await actions().uploadAttachment(file()); const metadata = attachment().attachment!;
    gateway.pages.set("a:0", [row(42, "gleich", { role: "user", attachments: [metadata] }), row(43, "gleich", { role: "user" })]);
    await actions().loadOlder(); const messages = runtime.store.get("a").messages;
    expect(messages.filter((message) => message.text === "gleich")).toHaveLength(2);
    expect(messages.find((message) => message.rowId === 42)?.attachments).toEqual([metadata]);
    expect(messages.find((message) => message.rowId === 43)?.attachments).toBeUndefined();
  });
  it("bewusster Resend eines alten Texts fügt keine inzwischen neue Datei hinzu", async () => {
    actions().setDraft("Alt"); gateway.handle = (frame) => frame.op === "message.submit";
    const sending = actions().submit(); await settle(); gateway.socket.drop(); await sending;
    gateway.handle = null; await vi.advanceTimersByTimeAsync(1000); await settle(); await actions().resync();
    await actions().uploadAttachment(file());
    await actions().resendUnknown({ acknowledgeDuplicateRisk: true });
    const sends = gateway.sent.filter((frame) => frame.op === "message.submit");
    expect(sends).toHaveLength(2); expect(sends[1]).not.toHaveProperty("attachmentIds");
    expect(view().composer.attachments).toHaveLength(1);
  });
  it("unklarer Dateisubmit wird erst nach Abgleich, bewusster Statusklärung und Risikobestätigung wiederholt", async () => {
    await actions().uploadAttachment(file()); const id = attachment().uploadId, metadata = attachment().attachment!;
    actions().setDraft("Mit Datei"); gateway.handle = (frame) => frame.op === "message.submit";
    const sending = actions().submit(); await settle(); gateway.socket.drop(); await sending;
    expect(view().unknownSend?.warning).toContain("doppelte Wirkung"); expect(view().composer.attachments).toHaveLength(1);
    gateway.handle = null; await vi.advanceTimersByTimeAsync(1000); await settle(); await actions().resync();
    await actions().resendUnknown({ acknowledgeDuplicateRisk: true });
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    await actions().checkUpload(id); await actions().resendUnknown({ acknowledgeDuplicateRisk: true });
    const sends = gateway.sent.filter((frame) => frame.op === "message.submit");
    expect(sends).toHaveLength(2); expect(sends[1]).toMatchObject({ text: "Mit Datei", attachmentIds: [metadata.id] });
    expect(uploads.calls.map((call) => call.method)).toEqual(["POST", "GET"]);
    expect(view().unknownSend).toBeNull(); expect(view().composer.attachments).toHaveLength(0);
  });
});
