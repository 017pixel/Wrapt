import { useFileManagerStore } from "../../stores/fileManager";
import { WarningIcon } from "../icons";

/** Älterer lokaler Entwurf gegenüber einem neueren Serverstand. */
export function FileManagerDraftConflict() {
  const draftConflict = useFileManagerStore((state) => state.draftConflict);
  const keepDraft = useFileManagerStore((state) => state.keepDraft);
  const dropDraft = useFileManagerStore((state) => state.dropDraft);
  if (!draftConflict) return null;
  return <div className="file-manager-alert is-sync has-actions" role="alert">
    <WarningIcon className="h-3.5 w-3.5" />
    <span>Ein lokaler Entwurf ist älter als der Serverstand. Welchen Stand möchtest du behalten?</span>
    <button type="button" onClick={keepDraft}>Lokalen Entwurf übernehmen</button>
    <button type="button" onClick={dropDraft}>Serverstand behalten</button>
  </div>;
}
