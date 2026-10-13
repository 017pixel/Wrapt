import type { NoteSummary } from "@wrapt/contracts";

/** Eine gemeinsame Sicht auf IDs, Eltern und geerbte Ordner pro Listenidentität. */
export function buildSidebarIndex(notes: readonly NoteSummary[]) {
  const active = notes.filter((note) => !note.archived);
  const byId = new Map(active.map((note) => [note.id, note]));
  const byFolder = new Map<string | null, NoteSummary[]>();
  const rootFolders = new Map<string, string | null>();
  for (const note of active) {
    const chain: NoteSummary[] = [];
    const seen = new Set<string>();
    let current = note;
    while (current.parentId && byId.has(current.parentId) && !seen.has(current.parentId) && !rootFolders.has(current.id)) {
      seen.add(current.id);
      chain.push(current);
      current = byId.get(current.parentId)!;
    }
    const folder = rootFolders.has(current.id) ? rootFolders.get(current.id)! : current.folderId ?? null;
    rootFolders.set(current.id, folder);
    for (const member of chain) rootFolders.set(member.id, folder);
    const members = byFolder.get(folder) ?? [];
    members.push(note);
    byFolder.set(folder, members);
  }
  return { active, byId, byFolder };
}
