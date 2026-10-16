import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "../ModalDialog";
import { wraptQueries } from "../../lib/queryOptions";
import { isLoopbackWorkspace, normalizeWorkspaceUrl, type WorkspaceEntry } from "./workspaceModel";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { preconnectWorkspace } from "./workspaceNetwork";
import { probeWorkspace, type WorkspaceProbeResult, type WorkspaceStatus } from "./workspaceStatus";
import { WorkspaceEditorDialog } from "./WorkspaceEditorDialog";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";
import { WorkspaceEntryMenu } from "./WorkspaceEntryMenu";
import "./workspaces.css";

interface WorkspaceRegistryViewProps {
  allowAdding?: boolean;
  onDialogOpenChange?(open: boolean): void;
}

export function WorkspaceRegistryView({ allowAdding = true, onDialogOpenChange }: WorkspaceRegistryViewProps) {
  const health = useQuery(wraptQueries.health());
  const entries = useWorkspaceRegistry((state) => state.entries);
  const selfUrl = useWorkspaceRegistry((state) => state.selfUrl);
  const add = useWorkspaceRegistry((state) => state.add);
  const edit = useWorkspaceRegistry((state) => state.edit);
  const updateSelfName = useWorkspaceRegistry((state) => state.updateSelfName);
  const remove = useWorkspaceRegistry((state) => state.remove);
  const beginSwitch = useWorkspaceRegistry((state) => state.beginSwitch);
  const [statuses, setStatuses] = useState<Record<string, WorkspaceStatus>>({});
  const [bootIds, setBootIds] = useState<Record<string, string | null>>({});
  const [checkingUrls, setCheckingUrls] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkspaceEntry | null>(null);
  const [removing, setRemoving] = useState<WorkspaceEntry | null>(null);
  const selfEntry = entries.find((entry) => entry.url === selfUrl);
  const selfBootId = health.data?.bootId ?? (selfEntry ? bootIds[selfEntry.url] : null) ?? null;
  const remoteSelf = Boolean(selfUrl && !isLoopbackWorkspace(selfUrl));
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    if (entry.url === selfUrl) return true;
    // Bestaetigter Alias desselben Backends: nur ausblenden wenn beide bootIds bekannt sind.
    if (selfBootId && bootIds[entry.url] && bootIds[entry.url] === selfBootId) return false;
    // Loopback ist geraetegebunden. In einer Remote Ansicht zeigt es auf den Betrachter,
    // nicht auf den Server, daher dort nie als eigenen Eintrag fuehren.
    if (remoteSelf && isLoopbackWorkspace(entry.url)) return false;
    return true;
  }), [bootIds, entries, selfBootId, selfUrl, remoteSelf]);
  const remoteCount = useMemo(() => visibleEntries.filter((entry) => entry.url !== selfUrl).length, [visibleEntries, selfUrl]);

  const checkStatuses = useCallback(async (entryUrl?: string) => {
    const currentEntries = useWorkspaceRegistry.getState().entries;
    const currentSelfUrl = useWorkspaceRegistry.getState().selfUrl;
    const remoteView = Boolean(currentSelfUrl && !isLoopbackWorkspace(currentSelfUrl));
    const targets = entryUrl ? currentEntries.filter((entry) => entry.url === entryUrl) : currentEntries;
    // Loopback in Remote Ansicht nicht pruefen: Der Probe liefe auf dem Server, nicht auf dem Geraet des Betrachters.
    const probed = targets.filter((entry) => entry.url === currentSelfUrl || !(remoteView && isLoopbackWorkspace(entry.url)));
    const targetUrls = probed.map((entry) => entry.url);
    if (!targetUrls.length) return;
    setCheckingUrls((current) => [...new Set([...current, ...targetUrls])]);
    setStatuses((current) => ({ ...current, ...Object.fromEntries(targetUrls.map((url) => [url, "checking"])) }));
    await Promise.all(probed.map(async (entry) => {
      const result = entry.url === currentSelfUrl
        ? { status: "live" as const, reachable: true, version: health.data?.version ?? null, instanceName: entry.name, appName: health.data?.appName ?? null, bootId: health.data?.bootId ?? null }
        : await probeWorkspace(entry.url);
      setStatuses((current) => ({ ...current, [entry.url]: result.status }));
      setBootIds((current) => ({ ...current, [entry.url]: result.bootId }));
    }));
    setCheckingUrls((current) => current.filter((url) => !targetUrls.includes(url)));
  }, [health.data?.appName, health.data?.bootId, health.data?.version]);

  useEffect(() => { void checkStatuses(); }, [checkStatuses]);
  const hoverPrefetch = useCallback((entry: WorkspaceEntry) => {
    preconnectWorkspace(entry.url);
  }, []);
  useEffect(() => {
    onDialogOpenChange?.(adding || editing !== null || removing !== null);
    return () => onDialogOpenChange?.(false);
  }, [adding, editing, removing, onDialogOpenChange]);

  const handleSave = (name: string, url: string, probe: WorkspaceProbeResult | null): boolean => {
    const normalized = normalizeWorkspaceUrl(url);
    if (!normalized) return false;
    if (editing) {
      if (editing.url === selfUrl) {
        updateSelfName(name.trim());
        setEditing(null);
        return true;
      }
      if (!edit(editing.id, name, normalized)) return false;
      if (probe) {
        const previousUrl = editing.url;
        setStatuses((current) => {
          const next = { ...current, [normalized]: probe.status };
          if (previousUrl !== normalized) delete next[previousUrl];
          return next;
        });
        setBootIds((current) => {
          const next = { ...current, [normalized]: probe.bootId };
          if (previousUrl !== normalized) delete next[previousUrl];
          return next;
        });
      }
      setEditing(null);
      return true;
    }
    if (entries.some((entry) => entry.url === normalized)) return false;
    const created = add(name, normalized);
    if (!created) return false;
    setStatuses((current) => ({ ...current, [created.url]: probe?.status ?? "not-checked" }));
    setBootIds((current) => ({ ...current, [created.url]: probe?.bootId ?? null }));
    setAdding(false);
    return true;
  };

  const closeEditor = () => { setAdding(false); setEditing(null); };

  return (
    <div className="workspace-registry-view">
      {allowAdding && remoteCount === 0 ? (
        <div className="workspace-empty-state">
          <p>Nur dieses Gerät verbunden.</p>
          <button type="button" className="quiet-button-primary workspace-add-button" onClick={() => setAdding(true)}>Server hinzufügen</button>
        </div>
      ) : null}

      <div className="workspace-entry-list" aria-label="Workspaces">
        {visibleEntries.map((entry) => {
          const isSelf = entry.url === selfUrl;
          const status = statuses[entry.url] ?? (isSelf ? "live" : "not-checked");
          return (
            <article
              className="workspace-entry"
              key={entry.url}
              onPointerEnter={() => hoverPrefetch(entry)}
              onPointerDown={() => hoverPrefetch(entry)}
              onFocusCapture={() => hoverPrefetch(entry)}
            >
              <div className="workspace-entry-row">
                <div className="workspace-entry-main">
                  <div className="workspace-entry-heading">
                    <WorkspaceStatusBadge status={status} />
                    <strong title={entry.name}>{entry.name}</strong>
                  </div>
                </div>
                <div className="workspace-entry-actions">
                  {isSelf ? <span className="workspace-entry-current">Aktuell</span> : (
                    <button type="button" className="workspace-open-button" onClick={() => beginSwitch(entry.id)} aria-label={`${entry.name} öffnen`}>
                      Öffnen
                    </button>
                  )}
                  <WorkspaceEntryMenu
                    entry={entry}
                    status={status}
                    isSelf={isSelf}
                    checking={checkingUrls.includes(entry.url)}
                    onCheck={() => void checkStatuses(entry.url)}
                    onEdit={() => setEditing(entry)}
                    onRemove={() => setRemoving(entry)}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {allowAdding && remoteCount > 0 ? <button type="button" className="quiet-button-primary workspace-add-button" onClick={() => setAdding(true)}>Server hinzufügen</button> : null}
      <WorkspaceEditorDialog
        open={adding || editing !== null}
        entry={editing}
        self={Boolean(editing && editing.url === selfUrl)}
        onClose={closeEditor}
        onSave={handleSave}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Workspace entfernen?"
        description={`${removing?.name ?? "Dieser Workspace"} wird aus der lokalen Liste entfernt. Die Instanz und ihre Daten bleiben unverändert.`}
        confirmLabel="Workspace entfernen"
        danger
        onConfirm={() => { if (removing) remove(removing.id); setRemoving(null); }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
