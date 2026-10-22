import { describe, expect, it } from "vitest";
import { applyChatSnapshot, applyChatHistory, applySubmitReceipt, emptyChatSession, optimisticUser } from "./chat-state";
import { applyChatEvent } from "./chat-events";
import { completed, event, inflight, row, snapshot } from "./chat-test-fixtures";

describe("sequenzierter Chat-State", () => {
  const initial = () => applyChatSnapshot(emptyChatSession("a"), snapshot());
  it("zeigt ältere Nachrichten ausschließlich mit einem ausdrücklichen Snapshot-Beleg", () => {
    expect(emptyChatSession("a").hasOlder).toBe(false);
    expect(initial().hasOlder).toBe(false);
    const partial = applyChatSnapshot(emptyChatSession("a"), snapshot("a", { hasOlder: true }));
    expect(partial.hasOlder).toBe(true);
    expect(applyChatSnapshot(partial, snapshot("a", { hasOlder: false })).hasOlder).toBe(false);
    expect(applyChatSnapshot(partial, snapshot()).hasOlder).toBe(false);
  });
  it("behält Delta → Tool → Delta in Reihenfolge und ersetzt den Finaltext autoritativ", () => {
    let state = initial();
    for (const entry of [
      event("message.delta", 1, { turnId: "turn", text: "Vorher" }),
      event("tool.started", 2, { toolId: "call", name: "lesen", input: "a", preview: "a" }),
      event("tool.completed", 3, { toolId: "call", name: "lesen", output: "ok", durationMs: 2, error: null }),
      event("message.delta", 4, { turnId: "turn", text: "Rohtext" }),
      event("message.completed", 5, completed("turn", "Transformiert")),
      event("message.delta", 6, { turnId: "turn", text: "zu spät" }),
    ]) state = applyChatEvent(state, entry);
    expect(state.messages.map((message) => message.text)).toEqual(["Vorher", "", "Transformiert"]);
    expect(state.tools[0]).toMatchObject({ status: "complete", outcome: "unknown", output: "ok" });
  });
  it("wertet Delta vor Snapshot aus, ersetzt es sofort und akzeptiert kleineren Same-Epoch-Cursor", () => {
    let state = applyChatEvent(initial(), event("message.delta", 40, { turnId: "old", text: "alt" }));
    const generation = state.generation;
    state = applyChatSnapshot(state, snapshot("a", { cursor: 2, inflight, running: true }));
    state = applyChatEvent(state, event("message.delta", 3, { turnId: "new", text: " neu" }));
    expect(state.messages.map((message) => message.text)).toEqual(["Frage", "Alt neu"]);
    expect(state.generation).toBe(generation + 1);
    expect(state.cursor).toBe(3);
  });
  it("ignoriert doppelte Sequenzen, fremde Session und alte Epoche", () => {
    const first = applyChatEvent(initial(), event("message.delta", 1, { turnId: "t", text: "A" }));
    for (const entry of [event("message.delta", 1, { turnId: "t", text: "A" }),
      event("message.delta", 2, { turnId: "t", text: "B" }, "b"),
      event("message.delta", 2, { turnId: "t", text: "C" }, "a", "old")]) {
      expect(applyChatEvent(first, entry)).toBe(first);
    }
  });
  it("verdoppelt alreadyStreamed-Interim nicht und zeigt explizites Reasoning", () => {
    let state = applyChatEvent(initial(), event("message.delta", 1, { turnId: "t", text: "A" }));
    state = applyChatEvent(state, event("reasoning.delta", 2, { turnId: "t", text: "Gedanke" }));
    state = applyChatEvent(state, event("message.interim", 3, { turnId: "t", text: "A", alreadyStreamed: true }));
    state = applyChatEvent(state, event("message.completed", 4, completed("t", "B")));
    expect(state.messages.map((message) => message.text)).toEqual(["A", "B"]);
    expect(state.messages[0]?.reasoning).toBe("Gedanke");
  });
  it("führt persistedTurn nur bei complete:true mit späterer History zusammen", () => {
    let state = optimisticUser(initial(), "send", "Frage");
    state = applyChatEvent(state, event("message.completed", 1, completed("t", "Antwort", { userRowId: 1, assistantRowId: 2, complete: false })));
    expect(state.messages.every((message) => message.rowId === null)).toBe(true);
    state = applySubmitReceipt(optimisticUser(initial(), "send", "Frage"), "send", 1);
    state = applyChatEvent(state, event("message.completed", 1, completed("t", "Antwort", { userRowId: 1, assistantRowId: 2, complete: true })));
    state = applyChatHistory(state, [row(1, "Frage", { role: "user" }), row(2, "Antwort", { logicalId: "a".repeat(32) })], 0, 2, false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]?.logicalId).toBe("a".repeat(32));
    expect(state.live).toHaveLength(0);
  });
  it("behält echte identische Texte getrennt und verbindet nur bewiesene UID-Kopien", () => {
    const messages = [row(1, "gleich", { logicalId: "a".repeat(32) }), row(2, "gleich", { logicalId: "b".repeat(32) })];
    let state = applyChatSnapshot(emptyChatSession("a"), snapshot("a", { messages }));
    state = applyChatHistory(state, [row(3, "gleich", { logicalId: "a".repeat(32) })], 0, 1, false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages.map((message) => message.rowId).sort()).toEqual([2, 3]);
  });
  it("behält ältere History vor dem neuen Snapshot und paginiert ohne Textdedupe", () => {
    let state = applyChatSnapshot(emptyChatSession("a"), snapshot("a", { messages: [row(3, "gleich")] }));
    state = applyChatHistory(state, [row(1, "gleich"), row(2, "gleich")], 1, 2, true);
    state = applyChatSnapshot(state, snapshot("a", { messages: [row(3, "gleich"), row(4, "neu")] }));
    expect(state.messages.map((message) => message.rowId)).toEqual([1, 2, 3, 4]);
  });
  it("erzeugt neben User-History keine zweite geratene Inflight-Userrow", () => {
    const state = applyChatSnapshot(emptyChatSession("a"), snapshot("a", { messages: [row(1, "Frage", { role: "user" })], inflight }));
    expect(state.messages.filter((message) => message.role === "user")).toHaveLength(1);
  });
  it("trennt wiederverwendete Tool-ID zwischen Turns und Vorkommen", () => {
    let state = initial();
    let seq = 0;
    for (const turnId of ["t1", "t2"]) {
      state = applyChatEvent(state, event("message.started", ++seq, { turnId }));
      for (let call = 0; call < 2; call++) {
        state = applyChatEvent(state, event("tool.started", ++seq, { toolId: "same", name: "tool", input: `${turnId}:${call}`, preview: "" }));
        state = applyChatEvent(state, event("tool.completed", ++seq, { toolId: "same", name: "tool", output: `${call}`, durationMs: null, error: call === 0 }));
      }
      state = applyChatEvent(state, event("message.completed", ++seq, completed(turnId)));
    }
    expect(state.tools).toHaveLength(4);
    expect(new Set(state.tools.map((tool) => tool.id)).size).toBe(4);
    expect(state.tools.map((tool) => tool.outcome)).toEqual(["error", "success", "error", "success"]);
  });
  it("macht generating nur zum flüchtigen Status und historische Beendigung nicht zu Erfolg", () => {
    let state = applyChatEvent(initial(), event("tool.generating", 1, { name: "lesen" }));
    expect(state.generatingTool).toBe("lesen");
    expect(state.tools).toEqual([]);
    state = applyChatSnapshot(state, snapshot("a", { messages: [row(1, "Ausgabe", { role: "tool", toolStatus: "complete" })] }));
    expect(state.generatingTool).toBeNull();
    expect(state.tools[0]?.outcome).toBe("unknown");
  });
  it("überschreibt den laufenden Turn nicht durch eine neu gequeuete Userzeile", () => {
    let state = applyChatEvent(applySubmitReceipt(optimisticUser(initial(), "first", "erste"), "first", 1), event("message.started", 1, { turnId: "active" }));
    state = optimisticUser(state, "queued", "zweite");
    state = applyChatEvent(state, event("message.completed", 2, completed("active", "A", { userRowId: 1, assistantRowId: 2, complete: true })));
    expect(state.messages.find((message) => message.rowId === 1)?.text).toBe("erste");
    expect(state.messages.find((message) => message.text === "zweite")?.rowId).toBeNull();
  });
  it("behält Requests ohne Sequenz per Key und ersetzt Claims durch Snapshot", () => {
    const request = { key: "b3b8476c-75a1-4abf-9017-3b97211d44bb", sessionId: "a", epoch: "epoch", createdAt: 1,
      kind: "secret", method: "secret", label: "Wert", hint: "" };
    let state = applyChatEvent(initial(), event("request.opened", null, request));
    state = applyChatEvent(state, event("request.opened", null, request));
    expect(state.requests).toHaveLength(1);
    state = applyChatSnapshot(state, snapshot("a", { epoch: "new" }));
    expect(state.requests).toEqual([]);
  });
  it("hält lange History und sichtbare Meldung an der Speichergrenze", () => {
    const messages = Array.from({ length: 30 }, (_, index) => row(index + 1, "x".repeat(200_000)));
    const state = applyChatHistory(initial(), messages, 0, 30, true);
    expect(state.messages.length).toBeLessThan(30);
    expect(state.history.length).toBe(state.messages.length);
    expect(state.error?.code).toBe("HISTORY_LIMIT");
    expect(state.hasOlder).toBe(false);
    expect(state.messages.at(-1)?.rowId).toBe(30);
  });
  it("trennt auch zwei identische echte Live-Antworten ohne Persistenzbeleg", () => {
    let state = applyChatEvent(initial(), event("message.completed", 1, completed("one", "gleich")));
    state = applyChatEvent(state, event("message.completed", 2, completed("two", "gleich")));
    expect(state.messages.map((message) => message.text)).toEqual(["gleich", "gleich"]);
    expect(state.messages[0]?.id).not.toBe(state.messages[1]?.id);
  });
  it("hält einen nach Snapshot gestarteten Toolcall beim ersten echten Turn-ID-Beleg zusammen", () => {
    let state = applyChatSnapshot(emptyChatSession("a"), snapshot("a", { inflight, running: true }));
    state = applyChatEvent(state, event("tool.started", 1, { toolId: "call", name: "lesen", input: "a", preview: "" }));
    const identity = state.tools[0]?.id;
    state = applyChatEvent(state, event("message.delta", 2, { turnId: "real", text: "danach" }));
    state = applyChatEvent(state, event("tool.completed", 3, { toolId: "call", name: "lesen", output: "ok", durationMs: null, error: false }));
    expect(state.tools).toHaveLength(1);
    expect(state.tools[0]).toMatchObject({ id: identity, turnId: "real", status: "complete", outcome: "success" });
  });
  it("begrenzt lange Live-Deltas mit sichtbarem Kürzungshinweis", () => {
    let state = applyChatEvent(initial(), event("message.delta", 1, { turnId: "t", text: "a".repeat(200_000) }));
    state = applyChatEvent(state, event("message.delta", 2, { turnId: "t", text: "Ende" }));
    expect(state.messages[0]?.text).toHaveLength(200_000);
    expect(state.messages[0]?.error).toContain("gekürzt");
    state = applyChatEvent(state, event("message.completed", 3, completed("t", "Autoritativ")));
    expect(state.messages[0]).toMatchObject({ text: "Autoritativ", error: null });
  });
});
