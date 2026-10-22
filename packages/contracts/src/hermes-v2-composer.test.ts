import { describe, expect, it } from "vitest";
import { hermesV2ClientMessageSchema, hermesV2AttachmentSchema, hermesV2ServerMessageSchema, hermesV2ComposerSettingsSchema, hermesV2ModelCatalogSchema } from "./hermes-v2.js";

describe("Composer-Verträge bleiben eng und additiv", () => {
  const uuid = "c3dd9680-a5a8-4813-a708-c28c0c37c280";
  const base = { v: 1, id: uuid, sessionId: "session" };
  it("akzeptiert alte Settings und begrenzt Freigabewechsel auf native Modi", () => {
    const old = { reasoning: { effort: null, wire: null }, approvals: { mode: "manual", effectiveBypass: false, scope: "global", editable: false } };
    expect(hermesV2ComposerSettingsSchema.parse(old).approvals.options).toEqual([]);
    for (const mode of ["manual", "smart", "off"])
      expect(hermesV2ClientMessageSchema.safeParse({ ...base, op: "composer.approvals", mode }).success).toBe(true);
    for (const extra of [{ mode: "ask" }, { mode: "off", key: "approvals.cron_mode" }, { mode: "off", scope: "session" }])
      expect(hermesV2ClientMessageSchema.safeParse({ ...base, op: "composer.approvals", ...extra }).success).toBe(false);
    expect(hermesV2ServerMessageSchema.safeParse({ v: 1, id: uuid, type: "result", op: "composer.approvals", data: { mode: "off", observed: old } }).success).toBe(true);
    expect(hermesV2ModelCatalogSchema.safeParse({ providers: [{ id: "p", label: "P", available: true, models: [], reportedModelCount: 0, note: "Keine Modelle gemeldet." }], current: null }).success).toBe(true);
  });
  it("Text darf ausschließlich mit eindeutigen höchstens zehn opaque Attachment-IDs leer sein", () => {
    const submit = { ...base, op: "message.submit", text: "" };
    expect(hermesV2ClientMessageSchema.safeParse(submit).success).toBe(false);
    expect(hermesV2ClientMessageSchema.safeParse({ ...submit, attachmentIds: ["a".repeat(64)] }).success).toBe(true);
    for (const ids of [[], ["../pfad"], ["a".repeat(64), "a".repeat(64)], Array.from({ length: 11 }, (_, index) => index.toString(16).padStart(64, "0"))])
      expect(hermesV2ClientMessageSchema.safeParse({ ...submit, attachmentIds: ids }).success).toBe(false);
  });
  it("erlaubt weder freie Commands noch globale Effort-/Approvalparameter", () => {
    for (const data of [{ op: "command.dispatch", text: "x" }, { op: "slash.exec", command: "/help" },
      { op: "reasoning.select", effort: "on", selection: { provider: "p", model: "m" } },
      { op: "reasoning.select", effort: "low", selection: { provider: "p", model: "m" }, scope: "global" },
      { op: "approval.select", mode: "off" }, { op: "session.title", title: " " }])
      expect(hermesV2ClientMessageSchema.safeParse({ ...base, ...data }).success).toBe(false);
  });
  it("begrenzt Dateien und projiziert keine frei adressierbaren Pfade", () => {
    const file = { id: "a".repeat(64), name: "x", bytes: 4_194_304, mime: "application/octet-stream", kind: "file-reference", expiresAt: 1 };
    expect(hermesV2AttachmentSchema.safeParse(file).success).toBe(true);
    expect(hermesV2AttachmentSchema.safeParse({ ...file, bytes: file.bytes + 1 }).success).toBe(false);
    expect(hermesV2AttachmentSchema.safeParse({ ...file, path: "/native/x" }).success).toBe(false);
    expect(hermesV2ServerMessageSchema.safeParse({ v: 1, type: "connection", state: "online", epoch: "e", connectionId: uuid }).success).toBe(true);
  });
});
