import { describe, expect, it } from "vitest";
import {
  saveWorkspaceRegistryRequestSchema,
  workspaceEntrySchema,
  workspaceRegistryResponseSchema,
} from "./workspaces.js";

const entry = {
  id: "macbook",
  name: "MacBook",
  url: "https://macbook.example:8443/pfad?x=1",
  addedAt: "2026-10-01T10:00:00.000Z",
  lastUsedAt: null,
};

describe("Workspace-Registry-Vertrag", () => {
  it("nimmt einen Eintrag an und kürzt die URL aufs Origin", () => {
    expect(workspaceEntrySchema.parse(entry)).toMatchObject({
      id: "macbook",
      name: "MacBook",
      url: "https://macbook.example:8443",
    });
  });

  it.each([
    "javascript:alert(1)",
    "//macbook.example/pfad",
    "https://nutzer:passwort@macbook.example",
    "keine-url",
  ])("lehnt unsichere URLs ab: %s", (url) => {
    expect(() => workspaceEntrySchema.parse({ ...entry, url })).toThrow();
  });

  it.each(["", "   ", "x".repeat(81), "Name\nmit Umbruch"])("lehnt ungültige Namen ab: %s", (name) => {
    expect(() => workspaceEntrySchema.parse({ ...entry, name })).toThrow();
  });

  it("begrenzt das Register auf 32 Einträge", () => {
    const entries = Array.from({ length: 33 }, (_, index) => ({ ...entry, id: `id-${index}`, url: `https://server-${index}.example` }));
    expect(() => workspaceRegistryResponseSchema.parse({
      document: { entries, changedAt: {}, deletedAt: {} },
      revision: 0,
      updatedAt: "2026-10-01T10:00:00.000Z",
    })).toThrow();
  });

  it("nimmt eine Speicheranfrage mit Revision an", () => {
    const parsed = saveWorkspaceRegistryRequestSchema.parse({
      document: { entries: [entry], changedAt: {}, deletedAt: {} },
      expectedRevision: 3,
    });
    expect(parsed.expectedRevision).toBe(3);
    expect(parsed.document.entries).toHaveLength(1);
  });
});
