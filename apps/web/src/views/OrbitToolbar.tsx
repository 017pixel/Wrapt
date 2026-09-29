import { useEffect, useState } from "react";
import type { OrbitBoard } from "@wrapt/contracts";
import { CloseIcon, EditIcon, FrameIcon, LocateIcon, NoteIcon, PreviewsIcon, PlusIcon, RedoIcon, SaveIcon, TrashIcon, UndoIcon } from "../components/icons";
import { OrbitBoardSwitcher } from "../components/orbit/OrbitBoardSwitcher";
import { OrbitInfoCenter } from "../components/orbit/OrbitInfoCenter";
import "./orbitControls.css";

interface OrbitToolbarProps {
  board: OrbitBoard;
  boards: readonly OrbitBoard[];
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  syncNotice: string | null;
  updatedAt: string | null;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  connectionsVisible: boolean;
  activeTools: number;
  activePreviews: number;
  historyVersion: number;
  onToolbarMount: (element: HTMLElement | null) => void;
  onToolbarScroll: (event: React.UIEvent<HTMLElement>) => void;
  onActivateBoard: (boardId: string) => void;
  onRenameBoard: (boardId: string, name: string) => void;
  onAddBoard: () => void;
  onRemoveBoard: (boardId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onQuicknote: () => void;
  onAddFrame: () => void;
  onToggleConnections: () => void;
  onOpenNotes: () => void;
  onOpenPreviews: () => void;
}

function syncLabel(error: string | null, saving: boolean, dirty: boolean, notice: string | null): string {
  if (error) return "Synchronisierung gestört";
  if (saving) return "Wird gespeichert";
  if (dirty) return "Ungespeicherte Änderung";
  return notice ? "Serverstand übernommen" : "Auf Server gespeichert";
}

export function OrbitToolbar(props: OrbitToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.board.name);
  useEffect(() => {
    if (!editing) setName(props.board.name);
  }, [editing, props.board.id, props.board.name]);
  const currentSyncLabel = syncLabel(props.syncError, props.saving, props.dirty, props.syncNotice);
  const syncTone = props.syncError ? "error" : props.saving || props.dirty ? "busy" : props.syncNotice ? "info" : "saved";

  const saveName = () => {
    const value = name.trim();
    if (!value) return;
    props.onRenameBoard(props.board.id, value);
    setEditing(false);
  };

  return (
    <>
      <OrbitInfoCenter
        board={props.board}
        saving={props.saving}
        dirty={props.dirty}
        syncError={props.syncError}
        syncNotice={props.syncNotice}
        updatedAt={props.updatedAt}
        revision={props.revision}
        activeTools={props.activeTools}
        activePreviews={props.activePreviews}
      />
      <nav ref={props.onToolbarMount} className="orbit-main-island" aria-label="Orbit-Steuerung" data-history-version={props.historyVersion} onScroll={props.onToolbarScroll}>
        <div className="orbit-board-control">
          {editing ? (
            <form className="orbit-board-rename" onSubmit={(event) => { event.preventDefault(); saveName(); }}>
              <input autoFocus aria-label="Name der Arbeitsfläche" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setName(props.board.name); setEditing(false); } }} />
              <button type="submit" disabled={!name.trim()} aria-label="Arbeitsfläche umbenennen speichern" title="Speichern"><SaveIcon className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setName(props.board.name); setEditing(false); }} aria-label="Umbenennen abbrechen" title="Abbrechen"><CloseIcon className="h-4 w-4" /></button>
            </form>
          ) : (
            <>
              <OrbitBoardSwitcher boards={props.boards} activeBoardId={props.board.id} onSelect={props.onActivateBoard} />
              <button type="button" onClick={() => { setName(props.board.name); setEditing(true); }} aria-label="Arbeitsfläche umbenennen" title="Arbeitsfläche umbenennen"><EditIcon className="h-4 w-4" /></button>
            </>
          )}
          <button type="button" onClick={props.onAddBoard} aria-label="Arbeitsfläche hinzufügen" title="Arbeitsfläche hinzufügen"><PlusIcon className="h-4 w-4" /></button>
          {props.boards.length > 1 ? <button type="button" onClick={() => props.onRemoveBoard(props.board.id)} aria-label="Arbeitsfläche entfernen" title="Arbeitsfläche entfernen"><TrashIcon className="h-4 w-4" /></button> : null}
        </div>
        <span className="orbit-island-divider" />
        <div className="orbit-island-buttons" aria-label="Verlauf und Aktionen">
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="Rückgängig" aria-label="Rückgängig"><UndoIcon className="h-4 w-4" /></button>
          <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="Wiederholen" aria-label="Wiederholen"><RedoIcon className="h-4 w-4" /></button>
          <button type="button" onClick={props.onQuicknote} title="Globale Notiz erstellen" aria-label="Globale Notiz erstellen"><NoteIcon className="h-4 w-4" /></button>
          <button type="button" onClick={props.onOpenNotes} title="Notizen öffnen" aria-label="Notizen öffnen"><NoteIcon className="h-4 w-4" /></button>
          <button type="button" onClick={props.onOpenPreviews} title="Preview-Verwaltung öffnen" aria-label="Preview-Verwaltung öffnen"><PreviewsIcon className="h-4 w-4" /></button>
          <button type="button" onClick={props.onAddFrame} title="Bereich hinzufügen" aria-label="Bereich hinzufügen"><FrameIcon className="h-4 w-4" /></button>
          <button type="button" onClick={props.onToggleConnections} className={props.connectionsVisible ? "is-active" : ""} title="Verbindungen umschalten" aria-label="Verbindungen umschalten"><LocateIcon className="h-4 w-4" /></button>
        </div>
        <span className="orbit-island-divider" />
        <div className={`orbit-sync-status is-${syncTone}`} role="status" aria-label={currentSyncLabel} title={currentSyncLabel}><span aria-hidden="true" /></div>
      </nav>
    </>
  );
}
