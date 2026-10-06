import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NoteFolder } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { FolderIcon, MoreIcon } from "../../icons";
import { PromptDialog } from "../../ModalDialog.js";
import { useDismissible } from "../hooks/useDismissible.js";

/** Erstellen und Bearbeiten von Ordnern verändern keine Notizinhalte. */
export function NotesFolderActions({ folder }: { folder?: NoteFolder }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissible({ open: menuOpen, rootRef, onClose: () => setMenuOpen(false) });
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ name, remove }: { name?: string; remove?: boolean }) => {
      if (folder && remove) return apiClient.deleteNoteFolder(folder.id);
      return folder ? apiClient.updateNoteFolder(folder.id, { name: name! }) : apiClient.createNoteFolder(name!);
    },
    onSuccess: () => { setDialogOpen(false); setMenuOpen(false); void queryClient.invalidateQueries({ queryKey: ["notes"] }); },
  });
  return <div className="notes-folder-actions" ref={rootRef}>
    <button type="button" className={folder ? "notes-group-action" : "notes-sidebar-folder-new"}
      aria-label={folder ? `${folder.name}: Ordneraktionen` : "Neuer Ordner"}
      aria-expanded={folder ? menuOpen : undefined}
      onClick={() => folder ? setMenuOpen((value) => !value) : setDialogOpen(true)}>
      {folder ? <MoreIcon aria-hidden /> : <><FolderIcon aria-hidden /> Neuer Ordner</>}
    </button>
    {menuOpen ? <div className="notes-folder-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialogOpen(true); }}>Umbenennen</button>
      <button type="button" role="menuitem" disabled={mutation.isPending} onClick={() => mutation.mutate({ remove: true })}>Ordner auflösen</button>
      <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>Schließen</button>
    </div> : null}
    {mutation.isError ? <p className="notes-folder-error" role="alert">Ordner konnte nicht gespeichert werden.</p> : null}
    <PromptDialog open={dialogOpen} title={folder ? "Ordner umbenennen" : "Neuer Ordner"} label="Ordnername"
      initialValue={folder?.name ?? ""} confirmLabel={folder ? "Umbenennen" : "Erstellen"}
      onConfirm={(name) => mutation.mutate({ name })} onClose={() => setDialogOpen(false)} />
  </div>;
}
