// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, settle, snapshot } from "./chat-test-fixtures";

describe("erneute Anmeldung nach fehlgeschlagenem Sitzungsabgleich", () => {
  let runtime: ChatRuntime;
  let gateway: TestGateway;
  const options = { ownerId: "owner", sessionId: "a", onSelectSession: vi.fn() };
  beforeEach(async () => {
    vi.useFakeTimers();
    useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway();
    runtime = new ChatRuntime(gateway.createClient());
    runtime.acquire(options);
    await settle();
  });
  afterEach(() => {
    runtime.dispose("v2-disabled");
    useAppPreferences.setState({ hermesV2Enabled: false });
    vi.useRealTimers();
  });

  it("verwirft nach erzwungenem Abgleichfehler das alte Abo und meldet sich beim nächsten Read neu an", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "session.subscribe") return false;
      queueMicrotask(() => socket.receive({ v: 1, type: "error", id: frame.id,
        code: "SESSION_UNAVAILABLE", message: "Abgleich fehlgeschlagen.", outcome: "not_sent", retryable: true }));
      return true;
    };
    await expect(runtime.ensureSubscribed("a", true)).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(runtime.sessionIsSynced("a")).toBe(false);
    expect(runtime.store.get("a")).toMatchObject({ writable: false, loading: false });

    gateway.handle = null;
    await runtime.actionsFor("owner").readCatalog();
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(3);
    expect(runtime.sessionIsSynced("a")).toBe(true);
    expect(runtime.store.get("a")).toMatchObject({ writable: true, error: null });
    runtime.actionsFor("owner").setDraft("Weiter");
    await runtime.actionsFor("owner").submit();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });

  it("lässt einen alten fehlgeschlagenen Abgleich kein inzwischen bestätigtes Abo entwerten", async () => {
    let pending!: HermesV2ClientMessage;
    gateway.handle = (frame) => {
      if (frame.op !== "session.subscribe") return false;
      pending = frame;
      return true;
    };
    const syncing = runtime.ensureSubscribed("a", true);
    const rejected = expect(syncing).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await settle();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { cursor: 10 }) });
    gateway.socket.receive({ v: 1, type: "error", id: pending.id,
      code: "SESSION_UNAVAILABLE", message: "Alter Abgleich fehlgeschlagen.", outcome: "not_sent", retryable: true });
    await rejected;
    expect(runtime.sessionIsSynced("a")).toBe(true);
    expect(runtime.store.get("a")).toMatchObject({ cursor: 10, writable: true, error: null });
  });

  it("entfernt nach erfolgreichem manuellem Abgleich die behobene Aktionsfehlermeldung und erhält den Entwurf", async () => {
    const actions = runtime.actionsFor("owner");
    actions.setDraft("Mein Entwurf");
    gateway.handle = (frame, socket) => {
      if (frame.op !== "session.subscribe") return false;
      queueMicrotask(() => socket.receive({ v: 1, type: "error", id: frame.id,
        code: "SESSION_UNAVAILABLE", message: "Abo fehlt.", outcome: "not_sent", retryable: true }));
      return true;
    };
    await actions.resync();
    expect(runtime.owners.getView("owner").actionError?.code).toBe("SESSION_UNAVAILABLE");
    gateway.handle = null;
    await actions.resync();
    expect(runtime.owners.getView("owner")).toMatchObject({ draft: "Mein Entwurf", actionError: null });
  });

  it("behält während des Abgleichs neu hinzugekommene Aktionsfehler", async () => {
    let pending!: HermesV2ClientMessage;
    const draft = runtime.owners.capture("owner").draft;
    draft.error = { code: "SESSION_UNAVAILABLE", message: "Alter Fehler", outcome: "not_sent" };
    gateway.handle = (frame) => {
      if (frame.op !== "history.read") return false;
      pending = frame;
      return true;
    };
    const syncing = runtime.actionsFor("owner").resync();
    await settle();
    const newerError = { code: "CLIENT_BUSY", message: "Neuer Fehler", outcome: "not_sent" as const };
    draft.error = newerError;
    gateway.socket.result(pending, { sessionId: "a", messages: [], offset: 0, returned: 0, hasMore: false });
    await syncing;
    expect(runtime.owners.getView("owner").actionError).toBe(newerError);
  });
});
