import { describe, expect, it } from "vitest";
import { RequestRegistry } from "./request-registry.js";
import { SecretRedactor } from "./secret-redactor.js";

const context = { origin: "127.0.0.1:1234", liveId: "live-a", epoch: "epoch-a", principal: "ben", sessionId: "stored-a", connectionId: "tab-a", transportId: "transport-a" };
const approval = { id: "srq-a", method: "approval", params: { session_id: "live-a", command: "rm build", choices: ["once", "deny"] } };

describe("RequestRegistry", () => {
  it("bindet Claim an Principal, Verbindung, Session und Epoche", () => {
    const registry = new RequestRegistry();
    const request = registry.observe(approval, context, () => undefined)!;
    for (const patch of [{ principal: "fremd" }, { connectionId: "tab-b" }, { liveId: "live-b" }, { sessionId: "stored-b" }, { epoch: "alt" }]) {
      expect(() => registry.claim(request.key, { ...context, ...patch }, { kind: "approval", choice: "once" })).toThrow(/abgelaufen/);
    }
    expect(registry.claim(request.key, context, { kind: "approval", choice: "once" })).toMatchObject({ id: "srq-a", result: { choice: "once" }, token: expect.any(String) });
  });
  it("erlaubt exakt eine lokale Antwort auch zwischen Principals", () => {
    const registry = new RequestRegistry();
    const first = registry.observe(approval, context, () => undefined)!;
    const other = { ...context, principal: "admin", connectionId: "tab-b" };
    expect(registry.observe(approval, other, () => undefined)!.key).toBe(first.key);
    registry.claim(first.key, context, { kind: "approval", choice: "once" });
    expect(() => registry.claim(first.key, other, { kind: "approval", choice: "deny" })).toThrow(/bereits/);
  });
  it("prüft angebotene Choices vor dem Claim und weist falsche Methode ab", () => {
    const registry = new RequestRegistry();
    const request = registry.observe(approval, context, () => undefined)!;
    expect(() => registry.claim(request.key, context, { kind: "approval", choice: "always" })).toThrow(/passt nicht/);
    expect(() => registry.claim(request.key, context, { kind: "secret", value: "dummy" })).toThrow(/passt nicht/);
    expect(() => registry.claim(request.key, context, { kind: "approval", choice: "deny" })).not.toThrow();
  });
  it("prüft QIDs und unveränderliche frühe Antworten; Freitext ist zulässig", () => {
    const registry = new RequestRegistry();
    const request = registry.observe({ id: "srq-q", method: "clarify", params: { session_id: "live-a", questions: [{ qid: "q1", question: "Welche?", choices: ["A"] }], answers: { q1: "A" } } }, context, () => undefined)!;
    expect(() => registry.lock(request.key, context, "q2", "B")).toThrow(/Frage/);
    expect(() => registry.claim(request.key, context, { kind: "clarify", answers: { q1: "B" } })).toThrow(/passt nicht/);
    expect(registry.claim(request.key, context, { kind: "clarify", answers: { q1: "A" } }).result).toEqual({ answers: { q1: "A" } });
  });
  it("verwirft stale Antworten nach Classic-Settlement oder Epochenwechsel", () => {
    const registry = new RequestRegistry();
    const closed: string[] = [];
    const request = registry.observe(approval, context, (key) => closed.push(key))!;
    registry.reconcile(context.origin, context.epoch, context.liveId, [], context.transportId);
    expect(closed).toEqual([request.key]);
    expect(() => registry.claim(request.key, context, { kind: "approval", choice: "once" })).toThrow(/abgelaufen/);
    const next = registry.observe(approval, context, () => undefined)!;
    registry.expireEpoch(context.origin, "epoch-b");
    expect(() => registry.claim(next.key, context, { kind: "approval", choice: "once" })).toThrow(/abgelaufen/);
  });
  it("entfernt bei Unsubscribe keine Views anderer abonnierter Sessions", () => {
    const registry = new RequestRegistry();
    const first = registry.observe(approval, context, () => undefined)!;
    const other = { ...context, liveId: "live-b", sessionId: "stored-b" };
    const second = registry.observe({ ...approval, id: "srq-b", params: { ...approval.params, session_id: "live-b" } }, other, () => undefined)!;
    registry.detach(context.principal, context.connectionId, context.sessionId);
    expect(() => registry.claim(first.key, context, { kind: "approval", choice: "once" })).toThrow();
    expect(() => registry.claim(second.key, other, { kind: "approval", choice: "once" })).not.toThrow();
  });
  it("bindet mehrere Stored-Aliase derselben Live-Session getrennt an eine Verbindung", () => {
    const registry = new RequestRegistry();
    const request = registry.observe(approval, context, () => undefined)!;
    const alias = { ...context, sessionId: "stored-compression-tip" };
    expect(registry.observe(approval, alias, () => undefined)?.key).toBe(request.key);
    registry.detach(context.principal, context.connectionId, context.sessionId);
    expect(() => registry.claim(request.key, alias, { kind: "approval", choice: "once" })).not.toThrow();
  });
  it("führt unbekannte Desktop-Requests nicht aus und speichert keine Secretantwort im Claim", () => {
    const registry = new RequestRegistry();
    expect(registry.observe({ ...approval, method: "preview.act" }, context, () => undefined)).toBeNull();
    const request = registry.observe({ ...approval, method: "secret" }, context, () => undefined)!;
    registry.claim(request.key, context, { kind: "secret", value: "dummy-super-secret" });
    expect(JSON.stringify(registry)).not.toContain("dummy-super-secret");
    const redactor = new SecretRedactor();
    redactor.remember("dummy-super-secret");
    expect(redactor.scrub({ text: "Echo dummy-super-secret" })).toEqual({ text: "Echo ***" });
  });
  it("redigiert Secrets auch über Streaming-Chunk-Grenzen und trennt Tabs", () => {
    const redactor = new SecretRedactor();
    redactor.remember("dummy-super-secret");
    expect(redactor.stream("tab-a:turn", "Echo dummy-super-")).toBe("Echo ");
    expect(redactor.stream("tab-b:turn", "Andere Nachricht")).toBe("Andere Nachricht");
    expect(redactor.stream("tab-a:turn", "secret fertig")).toBe("*** fertig");
  });

  it("gibt verlorene Claims erst nach Transportende und frischem autoritativem Abgleich frei", () => {
    const registry = new RequestRegistry();
    const request = registry.observe(approval, context, () => undefined)!;
    registry.claim(request.key, context, { kind: "approval", choice: "once" });
    const next = { ...context, transportId: "transport-b" };
    registry.reconcile(context.origin, context.epoch, context.liveId, [approval.id], next.transportId);
    expect(() => registry.claim(request.key, next, { kind: "approval", choice: "deny" })).toThrow(/bereits/);
    registry.endTransport(context.transportId);
    expect(() => registry.claim(request.key, next, { kind: "approval", choice: "deny" })).toThrow(/bereits/);
    registry.reconcile(context.origin, context.epoch, context.liveId, [approval.id], context.transportId);
    expect(() => registry.claim(request.key, next, { kind: "approval", choice: "deny" })).toThrow(/bereits/);
    registry.reconcile(context.origin, context.epoch, context.liveId, [approval.id], next.transportId);
    expect(() => registry.claim(request.key, next, { kind: "approval", choice: "deny" })).not.toThrow();
  });

  it("lässt einen verspäteten Lock-Abschluss keinen neueren Claim lösen", () => {
    const registry = new RequestRegistry();
    const raw = { id: "srq-q", method: "clarify", params: { session_id: context.liveId, questions: [{ qid: "q1", question: "Welche?" }] } };
    const request = registry.observe(raw, context, () => undefined)!;
    const old = registry.lock(request.key, context, "q1", "A");
    registry.endTransport(context.transportId);
    const next = { ...context, transportId: "transport-b" };
    registry.reconcile(context.origin, context.epoch, context.liveId, [raw.id], next.transportId);
    const current = registry.lock(request.key, next, "q1", "B");
    registry.unlock(request.key, old.token);
    expect(() => registry.claim(request.key, next, { kind: "cancel" })).toThrow(/bereits/);
    registry.unlock(request.key, current.token);
    expect(() => registry.claim(request.key, next, { kind: "cancel" })).not.toThrow();
  });
});
