// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, settle } from "./chat-test-fixtures";
import { composerSnapshot, TestUploads } from "./chat-composer-test-fixtures";

describe("Dateitransportbarrieren, Abbruch und explizite Statusklärung", () => {
  let runtime: ChatRuntime, gateway: TestGateway, uploads: TestUploads, release: () => void;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = () => runtime.actionsFor("one");
  const view = () => runtime.owners.getView("one");
  const file = () => new File(["a"], "a.txt");
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); gateway.composer = true;
    gateway.snapshots.set("a", composerSnapshot()); uploads = new TestUploads(); runtime = new ChatRuntime(gateway.createClient(), uploads.client());
    release = runtime.acquire(owner); await settle();
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each(["owner", "hidden", "parked", "document", "release", "flag"] as const)("%s bricht Fetch ab; ignorierter später Erfolg erzeugt keine alten Dateimetadaten", async (kind) => {
    let finish!: (value: Response) => void;
    uploads.handle = () => new Promise((resolve) => { finish = resolve; });
    const pending = actions().uploadAttachment(file()); await settle(); const id = uploads.calls[0]!.uploadId;
    if (kind === "owner") runtime.update({ ...owner, sessionId: "b" });
    if (kind === "hidden") runtime.update({ ...owner, visible: false });
    if (kind === "parked") runtime.update({ ...owner, active: false });
    if (kind === "document") { vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); }
    if (kind === "release") release();
    if (kind === "flag") useAppPreferences.setState({ hermesV2Enabled: false });
    expect(uploads.calls[0]!.signal?.aborted).toBe(true);
    finish(uploads.result(uploads.statuses.get(id))); await pending; await settle();
    expect(view().composer.attachments).toHaveLength(0); await vi.advanceTimersByTimeAsync(120_000); expect(uploads.calls).toHaveLength(1);
  });
  it("Remove ist lokal, abortet und lässt späte Ergebnisse nicht wieder auftauchen", async () => {
    let finish!: (value: Response) => void; uploads.handle = () => new Promise((resolve) => { finish = resolve; });
    const pending = actions().uploadAttachment(file()); await settle(); const id = uploads.calls[0]!.uploadId;
    actions().removeAttachment(id); expect(uploads.calls[0]!.signal?.aborted).toBe(true);
    finish(uploads.result(uploads.statuses.get(id))); await pending;
    expect(uploads.calls.map((call) => call.method)).toEqual(["POST"]); expect(view().composer.attachments).toHaveLength(0);
  });
  it("Timeout bewahrt UUID und entwertet alten Transport auch während neuer Statusklärung", async () => {
    let old!: (value: Response) => void, check!: (value: Response) => void;
    uploads.handle = (call) => new Promise((resolve) => { if (call.method === "POST") old = resolve; else check = resolve; });
    const pending = actions().uploadAttachment(file()); await settle(); const id = uploads.calls[0]!.uploadId;
    await vi.advanceTimersByTimeAsync(60_000); expect(view().composer.attachments[0]?.status).toBe("unknown");
    const checking = actions().checkUpload(id); await settle(); old(uploads.result(uploads.statuses.get(id))); await pending;
    expect(view().composer.attachments[0]?.status).toBe("unknown"); expect(uploads.calls[1]!.signal?.aborted).toBe(false);
    check(uploads.result(uploads.statuses.get(id))); await checking;
    expect(view().composer.attachments[0]?.status).toBe("ready"); expect(uploads.calls.map((call) => call.method)).toEqual(["POST", "GET"]);
  });
  it("neuer Transport verlangt bewussten GET mit derselben UUID und neu bestätigter Verbindung", async () => {
    await actions().uploadAttachment(file()); const id = view().composer.attachments[0]!.uploadId;
    const originalConnection = gateway.socket.connectionId; gateway.socket.drop(); await vi.advanceTimersByTimeAsync(1000); await settle();
    expect(view().composer.attachments[0]?.status).toBe("unknown"); await actions().submit("Text");
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
    await actions().checkUpload(id); expect(uploads.calls[1]).toMatchObject({ method: "GET", uploadId: id, connectionId: gateway.socket.connectionId });
    expect(gateway.socket.connectionId).not.toBe(originalConnection); expect(view().composer.attachments[0]?.status).toBe("ready");
    await actions().submit("Text"); expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it.each(["epoch", "cwd"] as const)("%s-Wechsel verbietet Statusreuse statt heimlicher Neuanbindung", async (kind) => {
    await actions().uploadAttachment(file()); const id = view().composer.attachments[0]!.uploadId;
    const next = kind === "epoch" ? composerSnapshot("a", { epoch: "next" })
      : composerSnapshot("a", { session: { ...composerSnapshot().session, cwd: "/anderer-kontext" } });
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: next }); await actions().checkUpload(id);
    expect(uploads.calls).toHaveLength(1); expect(view().composer.attachments[0]?.status).toBe("unknown");
  });
  it("Coreconnection-Epoche entwertet Belege auch bei unveränderter Snapshotepoche", async () => {
    await actions().uploadAttachment(file()); const id = view().composer.attachments[0]!.uploadId;
    gateway.socket.receive({ v: 1, type: "connection", state: "online", epoch: "core-neu", connectionId: gateway.socket.connectionId }); await settle();
    await actions().checkUpload(id); expect(uploads.calls).toHaveLength(1); expect(view().composer.attachments[0]?.status).toBe("unknown");
  });
  it("neues explizites Abo invalidiert Attachmentbinding, ohne automatisch GET oder POST zu starten", async () => {
    await actions().uploadAttachment(file()); await actions().resync();
    expect(view().composer.attachments[0]?.status).toBe("unknown"); expect(uploads.calls).toHaveLength(1);
  });
  it("A→B→A behält Textdrafts, aber keinerlei alte Uploadmetadaten", async () => {
    actions().setDraft("A"); await actions().uploadAttachment(file()); runtime.update({ ...owner, sessionId: "b" }); await settle();
    actions().setDraft("B"); runtime.update(owner); await settle();
    expect(view().draft).toBe("A"); expect(view().composer.attachments).toHaveLength(0); expect(uploads.calls).toHaveLength(1);
  });
});
