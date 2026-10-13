import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { Note } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { cacheSavedNote, invalidateNoteFolder, publishMovedNote, publishSavedNote } from "./noteQueryUpdates.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

async function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  cleanup.push(() => client.clear());
  const notes = Array.from({ length: 10 }, (_, index) => ({
    id: `note-${index}`, title: `Notiz ${index}`, content: "Text", revision: 1,
    parentId: index === 1 ? "target" : null, folderId: index === 2 ? "folder" : null,
    archived: false, favorite: false,
  } as Note));
  const calls = notes.map((note) => vi.fn(async () => ({ note })));
  const list = vi.fn(async () => ({ notes, folders: [] }));
  const search = vi.fn(async () => ({ notes }));
  const queries = notes.map((note, index) => ({ queryKey: ["notes", "detail", note.id], queryFn: calls[index]! }));
  await Promise.all(queries.map(async (options) => {
    const observer = new QueryObserver(client, options);
    cleanup.push(observer.subscribe(() => {}));
    await observer.refetch();
  }));
  for (const options of [{ queryKey: ["notes", "list"], queryFn: list }, { queryKey: ["notes", "search", "Text"], queryFn: search }]) {
    const observer = new QueryObserver(client, options);
    cleanup.push(observer.subscribe(() => {}));
    await observer.refetch();
  }
  [...calls, list, search].forEach((call) => call.mockClear());
  return { client, notes, calls, list, search };
}

it("reduziert Save-Fanout von elf Reads auf Liste und aktive Suche", async () => {
  const f = await fixture();
  const saved = { ...f.notes[0]!, revision: 2, content: "Neu" };
  await publishSavedNote(f.client, saved);
  expect(f.calls.every((call) => call.mock.calls.length === 0)).toBe(true);
  expect(f.list).toHaveBeenCalledOnce();
  expect(f.search).toHaveBeenCalledOnce();
  expect(f.client.getQueryData(["notes", "detail", saved.id])).toEqual({ note: saved });
});

it("aktualisiert beim Verschieben nur betroffene Geschwisterdetails", async () => {
  const f = await fixture();
  await publishMovedNote(f.client, { ...f.notes[0]!, parentId: "target" });
  expect(f.calls.map((call) => call.mock.calls.length)).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(f.list).toHaveBeenCalledOnce();
  expect(f.search).toHaveBeenCalledOnce();
});

it("Ordnername/Create invalidiert keine Details, Auflösen nur betroffene Wurzelseiten", async () => {
  const f = await fixture();
  await invalidateNoteFolder(f.client);
  expect(f.calls.every((call) => call.mock.calls.length === 0)).toBe(true);
  // Auch im Orbit ohne beobachtete Liste geben vorhandene Details den Ordner an.
  f.client.removeQueries({ queryKey: ["notes", "list"], exact: true });
  await invalidateNoteFolder(f.client, "folder");
  expect(f.calls.map((call) => call.mock.calls.length)).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
});

it("behält eine neuere Detailrevision bei verspäteter Speicherantwort", async () => {
  const f = await fixture();
  const fresh = { ...f.notes[0]!, revision: 4, content: "Frisch" };
  cacheSavedNote(f.client, fresh);
  cacheSavedNote(f.client, { ...fresh, revision: 2, content: "Alt" });
  expect(f.client.getQueryData(["notes", "detail", fresh.id])).toEqual({ note: fresh });
});
