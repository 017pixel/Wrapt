import { useEffect, useState, type FormEvent } from "react";
import { ModalFrame } from "../ModalDialog";
import { isLoopbackWorkspace, normalizeWorkspaceUrl, type WorkspaceEntry } from "./workspaceModel";
import { probeWorkspaceHealth, workspaceStatusLabels, type WorkspaceProbeResult } from "./workspaceStatus";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

const expectedVersion = typeof __WRAPT_APP_VERSION__ === "string" ? __WRAPT_APP_VERSION__ : "0.0.0";

interface WorkspaceEditorDialogProps {
  open: boolean;
  entry: WorkspaceEntry | null;
  self?: boolean;
  onClose(): void;
  onSave(name: string, url: string, probe: WorkspaceProbeResult | null): boolean;
}

export function WorkspaceEditorDialog({ open, entry, self = false, onClose, onSave }: WorkspaceEditorDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [probe, setProbe] = useState<{ url: string; result: WorkspaceProbeResult } | null>(null);
  const [probing, setProbing] = useState(false);
  const [message, setMessage] = useState("");
  const normalizedUrl = normalizeWorkspaceUrl(url);
  const needsConnectionTest = !self && (!entry || normalizedUrl !== entry.url);
  const currentProbe = normalizedUrl && probe?.url === normalizedUrl ? probe.result : null;
  const canSave = Boolean(name.trim() && normalizedUrl && (self ? normalizedUrl === entry?.url : !needsConnectionTest || currentProbe?.reachable));

  useEffect(() => {
    if (!open) return;
    setUrl(entry?.url ?? "");
    setName(entry?.name ?? "");
    setProbe(null);
    setMessage("");
    setProbing(false);
  }, [entry, open]);

  const checkConnection = async () => {
    if (!normalizedUrl) {
      setMessage("Bitte gib eine gültige HTTP- oder HTTPS-URL ein.");
      return;
    }
    if (!self && normalizedUrl.startsWith("http:") && !isLoopbackWorkspace(normalizedUrl)) {
      setMessage("Weitere Server benötigen eine HTTPS-Adresse; lokales HTTP ist nur für localhost möglich.");
      return;
    }
    setProbing(true);
    setMessage("");
    const result = await probeWorkspaceHealth(normalizedUrl, expectedVersion);
    setProbe({ url: normalizedUrl, result });
    setProbing(false);
    if (!result.reachable) {
      setMessage(`Verbindung fehlgeschlagen: ${workspaceStatusLabels[result.status]}.`);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>, requestClose: () => void) => {
    event.preventDefault();
    if (!normalizedUrl || !canSave) return;
    if (!onSave(name, normalizedUrl, currentProbe)) {
      setMessage("Diese URL ist bereits mit einem anderen Eintrag verbunden.");
      return;
    }
    requestClose();
  };

  return (
    <ModalFrame
      open={open}
      title={self ? "Instanz benennen" : entry ? "Server bearbeiten" : "Server hinzufügen"}
      description={self ? "Ändere den Namen, unter dem dieser Server in Wrapt erscheint." : "Verbinde eine Wrapt-Instanz über ihre URL."}
      className="workspace-editor-dialog"
      onClose={onClose}
    >
      {(requestClose) => (
        <form className="workspace-editor-form" onSubmit={(event) => submit(event, requestClose)}>
          {!self ? (
            <>
              <label>
                URL
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://server.example.ts.net"
                  value={url}
                  onChange={(event) => { setUrl(event.target.value); setMessage(""); }}
                  required
                />
              </label>
              <div className="workspace-editor-check">
                <button type="button" className="quiet-button" onClick={() => void checkConnection()} disabled={probing || !normalizedUrl}>
                  {probing ? "Prüfe …" : "Verbindung prüfen"}
                </button>
                {currentProbe ? <WorkspaceStatusBadge status={currentProbe.status} /> : null}
              </div>
              {currentProbe?.status === "incompatible" ? <p className="workspace-editor-hint" role="status">Die Instanz kann geöffnet werden. Einige Funktionen können sich unterscheiden.</p> : null}
            </>
          ) : null}
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="MacBook oder Linux Server"
              required
            />
          </label>
          {message ? <p className="workspace-editor-message" role="alert">{message}</p> : null}
          <div className="modal-actions">
            <button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button>
            <button type="submit" className="quiet-button-primary" disabled={!canSave || probing}>
              {entry ? "Änderungen speichern" : "Server hinzufügen"}
            </button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
