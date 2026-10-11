import { useEffect, useState } from "react";
import type { FilesystemEntry } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { ConfirmDialog } from "../ModalDialog";

interface FileManagerDeleteDialogProps {
  target: FilesystemEntry | null;
  onDeleted: (path: string) => void;
  onClose: () => void;
}

/**
 * Lösch-Schutz nach FileManager-Muster: Erst bestätigen, erst dann löschen.
 * Hält Fehler im Dialog (statt zu schließen) und verriegelt Doppelklicks über
 * confirmPending + interne Sperre.
 */
export function FileManagerDeleteDialog({ target, onDeleted, onClose }: FileManagerDeleteDialogProps) {
  const [pending, setPending] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (target === null) {
      setPending(false);
      setFehler(null);
    }
  }, [target]);
  return (
    <ConfirmDialog
      open={target !== null}
      title="Löschen bestätigen"
      description={target ? `„${target.name}“ wird dauerhaft vom Server entfernt.${target.kind === "directory" ? " Nur leere Ordner können gelöscht werden." : ""}` : ""}
      confirmLabel={pending ? "Wird gelöscht …" : "Löschen"}
      danger
      confirmPending={pending}
      error={fehler}
      onConfirm={() => {
        if (!target || pending) return;
        setPending(true);
        setFehler(null);
        void apiClient.fileManagerDelete(target.path).then(() => {
          onDeleted(target.path);
        }).catch((error: unknown) => {
          setFehler(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
        }).finally(() => {
          setPending(false);
        });
      }}
      onClose={onClose}
    />
  );
}
