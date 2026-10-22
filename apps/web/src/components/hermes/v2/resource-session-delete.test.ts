import { afterEach, describe, expect, it } from "vitest";
import { snapshot } from "./chat-test-fixtures";
import { workChild, workProcess } from "./chat-work-test-fixtures";
import { OrganizationState } from "./organization-state";
import { heldResource, jsonResource, resourceFixture, resourceRejection, resourceScope, settleResources, type ResourceFixture } from "./resource-test-fixtures";

describe("Native Sitzungsdeletebestätigung und genauer Cleanup", () => {
  let f: ResourceFixture;
  afterEach(() => f?.cleanup());
  it("liest volle Stored-ID ohne Chatlease und bestätigt die echte Kettenwirkung", async () => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full-id-tip" });
    expect(f.requests[0]?.path).toBe("sessions/full-id-tip/deletion");
    expect(f.gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(0);
    const token = f.actions.prepareSessionDeletion()!;
    expect(token).toMatchObject({ operation: "session.delete", targetId: "full-id-tip", generation: f.view().generation });
    await f.actions.deleteSession(token);
    expect(f.requests.find((request) => request.method === "DELETE")?.body).toEqual({ scope: resourceScope, confirm: "delete-compression-chain" });
    expect(f.forgotten).toEqual([["full-id-tip"]]);
    expect(f.view().actions.at(-1)).toMatchObject({ status: "confirmed", result: { requestedSessionId: "full-id-tip", affectedIdsComplete: false } });
  });
  it.each(["running", "unknown", "requests", "submitting", "unknown-send"])("lässt lokalen %s-Schutz auch bei früher positiver Vorschau bestehen", async (kind) => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    f.chat.seed(snapshot("full"));
    if (kind === "running") f.chat.store.update("full", (state) => ({ ...state, running: true }));
    if (kind === "unknown") f.chat.store.update("full", (state) => ({ ...state, running: null }));
    if (kind === "requests") f.chat.store.update("full", (state) => ({ ...state, requests: [{ key: "opaque" } as never] }));
    const owner = f.chat.owners.records.get("resource-owner")!;
    if (kind === "submitting" || kind === "unknown-send") {
      f.chat.owners.select(owner, "full"); await settleResources();
      const draft = f.chat.owners.capture(owner.id).draft;
      if (kind === "submitting") draft.submitting = true;
      else draft.unknown = { operation: "message.submit", text: null, warning: "Unklar", resynced: false, canResend: false,
        mode: undefined, ownerGeneration: owner.generation, draftVersion: draft.version };
      await f.actions.refresh();
    }
    expect(f.actions.prepareSessionDeletion()).toBeNull();
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
  });
  it("lässt native gesperrte oder unbekannte Vorschau disabled und liest sie nicht als Erfolg", async () => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    f.setHandler(() => jsonResource({ scope: resourceScope, requestedSessionId: "full", title: "full", deletable: false,
      reason: "Ungeklärte Hintergrundarbeit", effect: "compression-chain" }));
    await f.actions.refresh();
    expect(f.actions.prepareSessionDeletion()).toBeNull();
    expect(f.view().sessionDeletion.data?.reason).toBe("Ungeklärte Hintergrundarbeit");
  });
  it.each(["task", "unknown-subagent", "subagent", "process", "queue"])("bewahrt konkret beobachtete %s-Arbeit bei Vorschau und Cleanup", async (kind) => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    f.chat.seed(snapshot("full"));
    f.chat.store.update("full", (state) => ({ ...state, queuedText: kind === "queue" ? "Nächster Turn" : null,
      work: { ...state.work,
        tasks: kind === "task" ? [{ kind: "btw", id: "own-task", text: null, status: "running" }] : [],
        subagents: kind === "subagent" || kind === "unknown-subagent" ? [workChild("child", { status: kind === "subagent" ? "running" : null })] : [],
        processes: kind === "process" ? [workProcess()] : [] } }));
    expect(f.actions.prepareSessionDeletion()).toBeNull();
    expect(f.chat.forgetDeletedSessions(["full"])).toEqual([]); expect(f.chat.store.peek("full")).not.toBeNull();
  });
  it.each(["409", "unknown", "wrong-id", "missing-identity"])("behält Katalog und Auswahl bei %s", async (kind) => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    const token = f.actions.prepareSessionDeletion()!;
    f.setHandler((request) => request.method !== "DELETE" ? undefined : kind === "409" ? resourceRejection()
      : kind === "unknown" ? new Response("invalid") : jsonResource({ scope: resourceScope, outcome: "confirmed",
        requestedSessionId: kind === "wrong-id" ? "other" : "full", confirmedAbsentSessionIds: ["other"], alreadyAbsent: false,
        affectedIdsComplete: false, effect: "compression-chain" }));
    await f.actions.deleteSession(token);
    expect(f.forgotten).toEqual([]);
    expect(f.view().actions.at(-1)?.status).toBe(kind === "409" ? "rejected" : "unknown");
    expect(f.view().sessionDeletion.data?.requestedSessionId).toBe("full");
  });
  it("bereinigt ausschließlich exakt bestätigte IDs ohne angenommene Prefix-/Kettenkinder", async () => {
    f = await resourceFixture("session-delete", { deleteSessionId: "root.tip" });
    f.chat.seed(snapshot("root")); f.chat.seed(snapshot("root.tip")); f.chat.seed(snapshot("root.tip.child"));
    const token = f.actions.prepareSessionDeletion()!;
    await f.actions.deleteSession(token);
    expect(f.forgotten).toEqual([["root.tip"]]);
    // Der Client leitet keine vermeintlichen weiteren Kettenmitglieder aus IDs ab.
    expect(f.chat.store.peek("root")).not.toBeNull(); expect(f.chat.store.peek("root.tip.child")).not.toBeNull();
  });
  it("entwertet einen gehaltenen Delete-ACK bei Ziel-A-B-A und bereinigt dann nichts", async () => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    const held = heldResource<Response>();
    f.setHandler((request) => request.method === "DELETE" ? held.promise : undefined);
    const action = f.actions.deleteSession(f.actions.prepareSessionDeletion()!); await settleResources();
    f.update({ deleteSessionId: "other" }); f.update({ deleteSessionId: "full" }); await settleResources();
    held.resolve(jsonResource({ scope: resourceScope, outcome: "confirmed", requestedSessionId: "full", alreadyAbsent: false,
      confirmedAbsentSessionIds: ["full"], affectedIdsComplete: false, effect: "compression-chain" })); await action;
    expect(f.forgotten).toEqual([]); expect(f.view().actions.at(-1)?.status).toBe("unknown");
  });
  it("fasst zwei Deleteklicks zusammen und konsumiert die Bestätigung nur einmal", async () => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    const held = heldResource<Response>(); f.setHandler((request) => request.method === "DELETE" ? held.promise : undefined);
    const token = f.actions.prepareSessionDeletion()!;
    const one = f.actions.deleteSession(token), two = f.actions.deleteSession(token);
    held.resolve(jsonResource({ scope: resourceScope, outcome: "confirmed", requestedSessionId: "full", alreadyAbsent: true,
      confirmedAbsentSessionIds: ["full"], affectedIdsComplete: false, effect: "compression-chain" })); await Promise.all([one, two]);
    await f.actions.deleteSession(token);
    expect(f.requests.filter((request) => request.method === "DELETE")).toHaveLength(1); expect(f.forgotten).toHaveLength(1);
  });
  it("entfernt im vorhandenen ChatRuntime genau bestätigte inaktive IDs und deren Auswahl/Lease", async () => {
    f = await resourceFixture();
    const owner = f.chat.owners.records.get("resource-owner")!;
    f.chat.seed(snapshot("full")); f.chat.seed(snapshot("full.child"));
    f.chat.owners.select(owner, "full"); await settleResources();
    expect(f.chat.sessionIsLeased("full")).toBe(true);
    expect(f.chat.forgetDeletedSessions(["full"])).toEqual(["full"]);
    expect(f.chat.sessionIsLeased("full")).toBe(false); expect(owner.sessionId).toBeNull(); expect(f.selection.at(-1)).toBeNull();
    expect(f.chat.store.peek("full")).toBeNull(); expect(f.chat.store.peek("full.child")).not.toBeNull();
  });
  it("bewahrt neue lokale Arbeit, offene Requests und andere Auswahl beim Cleanup", async () => {
    f = await resourceFixture();
    const owner = f.chat.owners.records.get("resource-owner")!;
    f.chat.seed(snapshot("busy", { running: true })); f.chat.seed(snapshot("request", { requests: [{ key: crypto.randomUUID(), epoch: "epoch",
      sessionId: "request", createdAt: 0, kind: "approval", method: "approval", command: "synthetisch", description: "Testanfrage", choices: ["once", "deny"] }] }));
    f.chat.seed(snapshot("other")); f.chat.owners.select(owner, "other"); await settleResources();
    expect(f.chat.forgetDeletedSessions(["busy", "request"])).toEqual([]);
    expect(owner.sessionId).toBe("other"); expect(f.chat.store.peek("busy")?.running).toBe(true);
    expect(f.chat.store.peek("request")?.requests).toHaveLength(1);
  });
  it("lässt alte Summary- und Metadatenseiten gelöschte Organizationzeilen nicht wiederbeleben", () => {
    const state = new OrganizationState();
    const before = state.beginSummaryRead(); state.mergeSessions([snapshot("full").session], {}, before);
    const metadata = { sessionId: "full", revision: 1, pinRevision: 1, pinRank: null, snoozedUntil: null, settledAt: null };
    state.mergeMetadata([metadata as never]); state.forgetDeletedSessions(["full"]);
    state.mergeSessions([snapshot("full").session], {}, before); state.mergeMetadata([metadata as never]);
    expect(state.sessions.has("full")).toBe(false); expect(state.metadata.has("full")).toBe(false); expect(state.rows(["full"], 0)).toEqual([]);
  });
});
