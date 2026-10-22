import { describe, expect, it } from "vitest";
import { hermesV2OrganizeSchema, hermesV2ReadAckSchema, hermesV2ReorderSchema } from "./hermes-v2-organization.js";
import { hermesV2CatalogQuerySchema, hermesV2SummaryLookupSchema } from "./hermes-v2-summary.js";

describe("enge Organisationsverträge", () => {
  it("Lesen akzeptiert ausschließlich Session und echte Handles, keine Cursor-/Owner-/Source-Abkürzung", () => {
    const read = { sessionId: "session", evidence: ["a".repeat(64)] };
    expect(hermesV2ReadAckSchema.safeParse(read).success).toBe(true);
    for (const extra of [{ owner: "other" }, { sourceId: "uuid" }, { cursor: 999 }, { profile: "default" }])
      expect(hermesV2ReadAckSchema.safeParse({ ...read, ...extra }).success).toBe(false);
    expect(hermesV2ReadAckSchema.safeParse({ ...read, evidence: [] }).success).toBe(false);
    expect(hermesV2ReadAckSchema.safeParse({ ...read, evidence: Array(65).fill("a".repeat(64)) }).success).toBe(false);
  });
  it("Snooze verlangt Zielzeit ausschließlich bei Snooze, CAS bleibt Pflicht", () => {
    expect(hermesV2OrganizeSchema.safeParse({ sessionId: "session", expectedRevision: 0, action: "snooze" }).success).toBe(false);
    expect(hermesV2OrganizeSchema.safeParse({ sessionId: "session", expectedRevision: 0, action: "pin", snoozedUntil: 1 }).success).toBe(false);
    expect(hermesV2OrganizeSchema.safeParse({ sessionId: "session", action: "settle" }).success).toBe(false);
  });
  it("Such-/Lookup-/Reordergrenzen lassen weder freien Pfad noch Profil oder mehr als erlaubte IDs zu", () => {
    expect(hermesV2CatalogQuerySchema.safeParse({ cwd: "/etc" }).success).toBe(false);
    expect(hermesV2CatalogQuerySchema.safeParse({ profile: "other" }).success).toBe(false);
    expect(hermesV2CatalogQuerySchema.safeParse({ offset: 5001 }).success).toBe(false);
    expect(hermesV2SummaryLookupSchema.safeParse({ sessionIds: Array(101).fill("session") }).success).toBe(false);
    expect(hermesV2ReorderSchema.safeParse({ expectedPinRevision: 0, entries: Array(1001).fill({ sessionId: "x", expectedRevision: 0 }) }).success).toBe(false);
  });
});
