import { afterEach, describe, expect, it, vi } from "vitest";
import { createGlobalQuicknote } from "./notes.js";

afterEach(() => vi.unstubAllGlobals());

describe("createGlobalQuicknote", () => {
  it("erstellt eine globale Note und gibt deren note.id zurück", async () => {
    const noteId = "ef22df9d-bdf5-4aa2-9598-7a8a1a31d713";
    const now = "2026-09-26T12:00:00.000Z";
    const response = new Response(JSON.stringify({
      note: {
        id: noteId,
        title: "Schnellnotiz",
        content: "",
        icon: null,
        coverAssetId: null,
        parentId: null,
        sortOrder: 1,
        favorite: false,
        archived: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    }), { status: 201, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGlobalQuicknote();

    expect(result.note.id).toBe(noteId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/notes");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Schnellnotiz",
      parentId: null,
    });
  });

  it("nimmt einen expliziten Titel an, ohne eine Orbit-Zuordnung zu senden", async () => {
    const now = "2026-09-26T12:00:00.000Z";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      note: {
        id: "ef22df9d-bdf5-4aa2-9598-7a8a1a31d713",
        title: "Meeting",
        content: "",
        icon: null,
        coverAssetId: null,
        parentId: null,
        sortOrder: 1,
        favorite: false,
        archived: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    }), { status: 201, headers: { "Content-Type": "application/json" } })));

    await createGlobalQuicknote({ title: "Meeting" });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Meeting", parentId: null });
  });
});
