import { describe, expect, it } from "vitest";
import { requestResponse } from "./chat-request-response";
import { approval, clarify, requestKey, secret } from "./chat-request-test-fixtures";
import type { HermesV2Request } from "./chat-types";

describe("Antwortprojektion aus aktueller öffentlicher Anfrage", () => {
  it("behält Multiple-Auswahl als nativen JSON-String neben Freitext und null", () => {
    const answers = { q1: JSON.stringify(["A", "B"]), q2: "Freitext" };
    expect(requestResponse(clarify(), { kind: "clarify", answers })).toEqual({ kind: "clarify", answers });
    expect(requestResponse(clarify(), { kind: "clarify", answers: { q1: null, q2: "A" } })).toMatchObject({ answers: { q1: null } });
  });
  it("aktuelle lockedAnswers gewinnen über stale lokale Werte einschließlich null", () => {
    expect(requestResponse(clarify("a", { lockedAnswers: { q1: null } }), { kind: "clarify", answers: { q1: "stale", q2: "Neu" } }))
      .toEqual({ kind: "clarify", answers: { q1: null, q2: "Neu" } });
  });
  it("Clarify-Abbrechen bleibt die echte cancel-Antwort", () => {
    expect(requestResponse(clarify(), { kind: "cancel" })).toEqual({ kind: "cancel" });
    expect(() => requestResponse(approval(), { kind: "cancel" })).toThrow();
  });
  const setup = (multiple = false): HermesV2Request => ({ key: requestKey, epoch: "epoch", sessionId: "a", createdAt: 0, kind: "setup", method: "setup_choose",
    question: "Auswahl", multiple, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });
  it("Setup überträgt nur angebotene IDs, korrekte Kardinalität und picked:null", () => {
    expect(requestResponse(setup(), { kind: "setup", picked: "a" })).toMatchObject({ picked: "a" });
    expect(requestResponse(setup(true), { kind: "setup", picked: ["a", "b"] })).toMatchObject({ picked: ["a", "b"] });
    expect(requestResponse(setup(), { kind: "setup", picked: null })).toMatchObject({ picked: null });
    expect(() => requestResponse(setup(), { kind: "setup", picked: ["a", "b"] })).toThrow();
    expect(() => requestResponse(setup(true), { kind: "setup", picked: ["a", "a"] })).toThrow();
    expect(() => requestResponse(setup(), { kind: "setup", picked: "foreign" })).toThrow();
  });
  it("Secret überspringen bleibt ein leerer Wert, Login ein flüchtiger JSON-String", () => {
    expect(requestResponse(secret(), { kind: "secret", value: "" })).toEqual({ kind: "secret", value: "" });
    const value = JSON.stringify({ identifier: "fixture", password: "synthetic-secret" });
    expect(requestResponse(secret("a", "vault.save_login"), { kind: "secret", value })).toEqual({ kind: "secret", value });
  });
});
