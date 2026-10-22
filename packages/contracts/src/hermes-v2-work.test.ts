import { describe, expect, it } from "vitest";
import { hermesV2ClientMessageSchema, hermesV2EventSchema } from "./hermes-v2.js";
import { hermesV2WorkPatchSchema } from "./hermes-v2-work.js";

describe("Work-Domainverträge", () => {
  const session = { v: 1, id: "12345678-1234-4234-8234-123456789abc", sessionId: "session" };
  it("akzeptiert ausschließlich konkrete Domainaktionen statt freier Native-RPCs", () => {
    expect(hermesV2ClientMessageSchema.safeParse({ ...session, op: "work.subagent.interrupt", subagentId: "kind" }).success).toBe(true);
    for (const message of [{ op: "work.stopTree" }, { op: "process.stop" }, { op: "work.background", text: "", method: "shell.exec" },
      { op: "work.subagent.tail", processId: "prozess" }])
      expect(hermesV2ClientMessageSchema.safeParse({ ...session, ...message }).success).toBe(false);
  });
  it("Teilpatches unterscheiden Auslassung/null und verlangen beide Delegationsschlüssel", () => {
    expect(hermesV2WorkPatchSchema.parse({ kind: "subagent", id: "kind", model: null })).toEqual({ kind: "subagent", id: "kind", model: null });
    expect(hermesV2WorkPatchSchema.safeParse({ kind: "delegation", delegationId: "delegation" }).success).toBe(false);
    expect(hermesV2WorkPatchSchema.safeParse({ kind: "delegation", delegationId: "delegation", taskIndex: 0 }).success).toBe(true);
  });
  it("Events sind revisionsgebundene konkrete Patches", () => {
    expect(hermesV2EventSchema.safeParse({ type: "work.updated", sessionId: "session", epoch: "epoch", seq: 1,
      payload: { revision: 1, change: { kind: "btw", id: "aufgabe", status: "completed", text: "Antwort" } } }).success).toBe(true);
  });
});
