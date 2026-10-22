import { useEffect, useState } from "react";
import { ModalFrame } from "../../ModalDialog";
import { projectsApi } from "../../../lib/apiClient/projects";
import type { HermesV2Chat } from "./chat-types";
import {
  HermesV2ProjectPicker,
  type HermesV2ProjectOption,
} from "./HermesV2ProjectPicker";

/** Auswahl echter Projekte für eine neue Sitzung; ohne Projekt bleibt null. */
export function HermesV2NewSessionDialog({
  chat,
  open,
  onClose,
}: {
  chat: HermesV2Chat;
  open: boolean;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<HermesV2ProjectOption[] | null>(
    null,
  );
  const [projectId, setProjectId] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjectId("");
    setError(null);
    setLoadError(null);
    let cancelled = false;
    const controller = new AbortController();
    projectsApi.projects(controller.signal).then(
      (result) => {
        if (cancelled) return;
        setProjects(
          result.projects.map((project) => ({
            id: project.id,
            name: project.name,
            lastUsedAt: project.activity?.lastWorkbenchUseAt ?? null,
          })),
        );
      },
      () => {
        // Verlassen oder Abbrechen des Ladens ist kein Fehler und ein
        // veraltetes Ergebnis überöffentlicht den wieder geöffneten Dialog nicht.
        if (cancelled || controller.signal.aborted) return;
        setProjects(null);
        setLoadError(
          "Die Projektliste konnte nicht geladen werden. Bitte erneut versuchen.",
        );
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await chat.createSession({ projectId: projectId || null });
      onClose();
    } catch {
      setError("Die Sitzung konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame
      open={open}
      title="Neue Sitzung"
      onClose={onClose}
      className="hermesv2-newsession"
    >
      {() => (
        <div className="hermesv2-new-session-form">
          <HermesV2ProjectPicker
            projects={projects ?? []}
            value={projectId}
            onChange={setProjectId}
          />
          {loadError ? (
            <p className="hermesv2-form-error" role="status">
              {loadError}
            </p>
          ) : null}
          {error ? (
            <p className="hermesv2-form-error" role="status">
              {error}
            </p>
          ) : null}
          <div className="hermesv2-form-actions">
            <button type="button" className="quiet-button" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="button"
              className="quiet-button-primary"
              onClick={() => void create()}
              disabled={busy}
            >
              {busy ? "Erstellt…" : "Sitzung erstellen"}
            </button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
