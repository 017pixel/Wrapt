// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { HermesV2MessageList } from "./HermesV2MessageList";
import { row, settle, snapshot, TestGateway } from "./chat-test-fixtures";

describe("Historienanzeige und einmalige Lesefehler", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn() };
  const actions = () => runtime.actionsFor("one");
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient());
  });
  afterEach(() => {
    cleanup(); runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers();
  });

  it("zeigt im neu erstellten Chat weder Historienknopf noch Fehler und liest keine Historie zusätzlich", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "session.create") return false;
      const fresh = snapshot("created", { hasOlder: false });
      fresh.session.draft = true;
      socket.result(frame, { snapshot: fresh }); return true;
    };
    runtime.acquire({ ...owner, sessionId: null }); await settle();
    const id = await actions().createSession({ projectId: null }); await settle();
    const state = runtime.store.get(id);
    render(createElement(HermesV2MessageList, { snapshot: state, onLoadOlder: vi.fn() }));
    expect(screen.queryByRole("button", { name: "Ältere Nachrichten laden" })).toBeNull();
    expect(state.error).toBeNull(); expect(runtime.owners.getView("one").actionError).toBeNull();
    expect(gateway.sent.some((frame) => frame.op === "history.read")).toBe(false);
  });

  it("zeigt den Knopf bei belegtem Verlauf und lädt die nächste Seite weiter", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(3, "Neu")], hasOlder: true }));
    gateway.pages.set("a:0", [row(3, "Neu")]); gateway.pages.set("a:1", [row(1, "Alt"), row(2, "Dazwischen")]);
    runtime.acquire(owner); await settle();
    const list = render(createElement(HermesV2MessageList, { snapshot: runtime.store.get("a"), onLoadOlder: vi.fn() }));
    expect(screen.queryByRole("button", { name: "Ältere Nachrichten laden" })).not.toBeNull();
    expect(gateway.sent.some((frame) => frame.op === "history.read")).toBe(false);
    await actions().loadOlder();
    expect(runtime.store.get("a").messages.map((message) => message.rowId)).toEqual([1, 2, 3]);
    list.rerender(createElement(HermesV2MessageList, { snapshot: runtime.store.get("a"), onLoadOlder: vi.fn() }));
    expect(screen.queryByRole("button", { name: "Ältere Nachrichten laden" })).toBeNull();
  });

  it("zeigt einen echten Lesefehler genau in der Aktionsablage", async () => {
    gateway.snapshots.set("a", snapshot("a", { hasOlder: true }));
    gateway.handle = (frame, socket) => {
      if (frame.op !== "history.read") return false;
      socket.receive({ v: 1, type: "error", id: frame.id, code: "OPERATION_FAILED", outcome: "not_sent",
        message: "Die Hermes-Anfrage konnte nicht verarbeitet werden.", retryable: false }); return true;
    };
    runtime.acquire(owner); await settle();
    await actions().loadOlder();
    const view = runtime.owners.getView("one");
    expect(view.actionError?.message).toBe("Die Hermes-Anfrage konnte nicht verarbeitet werden.");
    expect(runtime.store.get("a")).toMatchObject({ error: null, loadingOlder: false, hasOlder: true });
    expect(view.unknownSend).toBeNull();
  });
});
