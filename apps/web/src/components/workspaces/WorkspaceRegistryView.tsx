import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "../ModalDialog";
import { wraptQueries } from "../../lib/queryOptions";
import { isLoopbackWorkspace, normalizeWorkspaceUrl, type WorkspaceEntry } from "./workspaceModel";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { preconnectWorkspace } from "./workspaceNetwork";
import { probeWorkspaceHealth, type WorkspaceProbeResult, type WorkspaceStatus } from "./workspaceStatus";
import { WorkspaceEditorDialog } from "./WorkspaceEditorDialog";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";
import { WorkspaceEntryMenu } from "./WorkspaceEntryMenu";
import "./workspaces.css";

const expectedVersion = typeof __WRAPT_APP_VERSION__ === "string" ? __WRAPT_APP_VERSION__ : "0.0.0";

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
  const [checkingIds, setCheckingIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkspaceEntry | null>(null);
  const [removing, setRemoving] = useState<WorkspaceEntry | null>(null);
  const selfEntry = entries.find((entry) => entry.url === selfUrl);
  const selfBootId = health.data?.bootId ?? (selfEntry ? bootIds[selfEntry.id] : null) ?? null;
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    if (entry.url === selfUrl) return true;
    if (selfBootId && bootIds[entry.id] === selfBootId) return false;
    return !(selfBootId && !bootIds[entry.id] && isLoopbackWorkspace(entry.url) && checkingIds.includes(entry.id));
  }), [bootIds, checkingIds, entries, selfBootId, selfUrl]);
  const remoteCount = useMemo(() => visibleEntries.filter((entry) => entry.url !== selfUrl).length, [visibleEntries, selfUrl]);

  const checkStatuses = useCallback(async (entryId?: string) => {
    const currentEntries = useWorkspaceRegistry.getState().entries;
    const currentSelfUrl = useWorkspaceRegistry.getState().selfUrl;
    const targets = entryId ? currentEntries.filter((entry) => entry.id === entryId) : currentEntries;
    const targetIds = targets.map((entry) => entry.id);
    if (!targetIds.length) return;
    setCheckingIds((current) => [...new Set([...current, ...targetIds])]);
    setStatuses((current) => ({ ...current, ...Object.fromEntries(targetIds.map((id) => [id, "checking"])) }));
    await Promise.all(targets.map(async (entry) => {
      const result = entry.url === currentSelfUrl
        ? { status: "live" as const, reachable: true, version: health.data?.version ?? null, instanceName: entry.name, appName: health.data?.appName ?? null, bootId: health.data?.bootId ?? null }
        : await probeWorkspaceHealth(entry.url, expectedVersion);
      setStatuses((current) => ({ ...current, [entry.id]: result.status }));
      setBootIds((current) => ({ ...current, [entry.id]: result.bootId }));
    }));
    setCheckingIds((current) => current.filter((id) => !targetIds.includes(id)));
  }, [health.data?.appName, health.data?.bootId, health.data?.version]);

  useEffect(() => { void checkStatuses(); }, [checkStatuses]);
  const hoverPrefetch = useCallback((entry: WorkspaceEntry) => {
    preconnectWorkspace(entry.url);
    if (entry.url === selfUrl) return;
    if (statuses[entry.id] === "checking" || statuses[entry.id] === "live") return;
    if (checkingIds.includes(entry.id)) return;
    void checkStatuses(entry.id);
  }, [checkStatuses, checkingIds, selfUrl, statuses]);
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
        setStatuses((current) => ({ ...current, [editing.id]: probe.status }));
        setBootIds((current) => ({ ...current, [editing.id]: probe.bootId }));
      }
      setEditing(null);
      return true;
    }
    if (entries.some((entry) => entry.url === normalized)) return false;
    const created = add(name, normalized);
    if (!created) return false;
    setStatuses((current) => ({ ...current, [created.id]: probe?.status ?? "not-checked" }));
    setBootIds((current) => ({ ...current, [created.id]: probe?.bootId ?? null }));
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
          const status = statuses[entry.id] ?? (isSelf ? "live" : "not-checked");
          return (
            <article
              className="workspace-entry"
              key={entry.id}
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
                    checking={checkingIds.includes(entry.id)}
                    onCheck={() => void checkStatuses(entry.id)}
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
