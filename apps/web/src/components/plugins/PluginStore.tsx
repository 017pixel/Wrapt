import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogEntry, ExtensionId, ExtensionLifecycleState } from "@wrapt/extension-contracts";
import type { PluginExample } from "@wrapt/contracts";
import { ExtensionsIcon, RefreshIcon } from "../icons";
import { Badge } from "../primitives";
import { ConfirmDialog } from "../ModalDialog";
import { RestartProgress, useSystemRestart } from "../SystemRestartControls";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { PluginIcon } from "./pluginIcons";
import { pluginLifecycleLabel, pluginLifecycleTone } from "./pluginLifecycle";
import { PluginNotice } from "./PluginNotice";
import { pluginHostRoute } from "./pluginSurfaceState";
import { openGlobalContextMenu } from "../context-menu/contextMenuEvents";
import { hostContextMenuId } from "../../extensions/hostContextMenus";

interface PluginStoreProps {
  examples: PluginExample[];
}

interface StoreNotice {
  text: string;
  tone: "info" | "bad";
  restartRequired?: boolean;
}

export function PluginStore({ examples }: PluginStoreProps) {
  const queryClient = useQueryClient();
  const catalog = useQuery(wraptQueries.extensionCatalog());
  const registry = useQuery(wraptQueries.extensionRegistry());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<StoreNotice | null>(null);
  const [loadErrorDismissed, setLoadErrorDismissed] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: ExtensionId; name: string } | null>(null);
  const restart = useSystemRestart();
  const installed = new Map((registry.data?.extensions ?? []).map((extension) => [extension.id, extension]));

  const refresh = () => {
    setLoadErrorDismissed(false);
    void queryClient.invalidateQueries({ queryKey: ["extensions"] });
  };

  const install = async (entry: CatalogEntry) => {
    if (!catalog.data || !registry.data) return;
    setBusyId(entry.manifest.id);
    setNotice(null);
    try {
      await apiClient.dispatchExtensionOperation({
        operation: "install",
        extensionId: entry.manifest.id,
        expectedRevision: registry.data.revision,
        source: {
          kind: "catalog",
          providerId: catalog.data.providerId,
          catalogRevision: catalog.data.revision,
          version: entry.manifest.version,
          packageIntegrity: entry.package.integrity,
        },
        enableAfterInstall: true,
      });
      setNotice({ text: `„${entry.manifest.name}“ wurde hinzugefügt.`, tone: "info", restartRequired: true });
      refresh();
    } catch (error) {
      setNotice({ text: error instanceof ApiClientError ? error.message : "Das Plugin konnte nicht hinzugefügt werden.", tone: "bad" });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (id: ExtensionId, lifecycle: ExtensionLifecycleState) => {
    if (!registry.data) return;
    setBusyId(id);
    try {
      await apiClient.dispatchExtensionOperation({
        operation: lifecycle === "active" ? "disable" : "enable",
        extensionId: id,
        expectedRevision: registry.data.revision,
      });
      setNotice({ text: `Das Plugin wurde ${lifecycle === "active" ? "deaktiviert" : "aktiviert"}.`, tone: "info" });
      refresh();
    } catch (error) {
      setNotice({ text: error instanceof ApiClientError ? error.message : "Der Status konnte nicht geändert werden.", tone: "bad" });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const uninstall = async () => {
    if (!registry.data || !removeTarget) return;
    setBusyId(removeTarget.id);
    setNotice(null);
    try {
      await apiClient.dispatchExtensionOperation({ operation: "uninstall", extensionId: removeTarget.id, expectedRevision: registry.data.revision, data: "delete" });
      setNotice({ text: `„${removeTarget.name}“ wurde entfernt.`, tone: "info" });
      setRemoveTarget(null);
      refresh();
    } catch (error) {
      setNotice({ text: error instanceof ApiClientError ? error.message : "Das Plugin konnte nicht entfernt werden.", tone: "bad" });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const loadError = catalog.error ?? registry.error;
  const storeReady = Boolean(catalog.data && registry.data);

  return (
    <section className="plugins-section plugins-tab-section" aria-labelledby="plugin-store-title">
      <header className="plugins-section-heading"><div><span className="plugins-kicker">Lokaler Beta-Store</span><h2 id="plugin-store-title">Plugins installieren</h2><p>{examples.length} lokale Plugins aus <code>extensions/plugins</code>. Installiere ein Beispiel direkt für deine lokale Workbench.</p></div><button type="button" className="icon-button" onClick={refresh} aria-label="Plugin-Store aktualisieren" title="Aktualisieren"><RefreshIcon className="h-4 w-4" /></button></header>
      {loadError && !loadErrorDismissed ? <PluginNotice tone="bad" onClose={() => setLoadErrorDismissed(true)}><span>Der Plugin-Store konnte nicht vollständig geladen werden.</span><button type="button" className="quiet-button" onClick={refresh}>Erneut laden</button></PluginNotice> : null}
      {notice ? <PluginNotice tone={notice.tone} onClose={() => setNotice(null)}><span>{notice.text}</span>{notice.restartRequired ? <div className="plugin-restart-flow">{restart.phase.status !== "idle" ? <RestartProgress phase={restart.phase} /> : <span className="plugin-restart-hint">Aktualisiert Plugin-Routen und Laufzeit in einem Schritt.</span>}<button type="button" className="quiet-button" disabled={restart.phase.status === "working"} onClick={() => void restart.restart("both")}><RefreshIcon className={`h-3.5 w-3.5 ${restart.phase.status === "working" ? "animate-spin" : ""}`} />{restart.phase.status === "error" ? "Erneut versuchen" : restart.phase.status === "working" ? "Neustart läuft" : "Wrapt neu starten"}</button></div> : null}</PluginNotice> : null}
      <div className="plugins-store-grid">
        {examples.map((example) => {
          const entry = catalog.data?.entries.find((item) => item.manifest.id === `wrapt.example.${example.exampleId}`);
          const current = entry ? installed.get(entry.manifest.id) : undefined;
          const installedCurrent = current && current.lifecycle !== "available" ? current : undefined;
          const busy = busyId === entry?.manifest.id;
          const installLabel = busy ? "Wird installiert" : catalog.isLoading || registry.isLoading ? "Status wird geladen" : !entry ? "Paket fehlt" : !storeReady ? "Status fehlt" : "Installieren";
          return <article className="plugin-store-card" key={example.exampleId} onContextMenu={(event) => openGlobalContextMenu(event, {
            surface: "host.context-menu.extensions",
            title: example.name,
            actions: [
              { id: hostContextMenuId("extensions.toggle"), label: installedCurrent ? installedCurrent.lifecycle === "active" ? "Deaktivieren" : "Aktivieren" : "Installieren", checked: installedCurrent?.lifecycle === "active", disabled: busy || !entry || !storeReady, onSelect: () => installedCurrent ? toggle(installedCurrent.id, installedCurrent.lifecycle) : entry ? install(entry) : undefined },
              { id: hostContextMenuId("extensions.settings"), onSelect: () => window.location.assign("/settings#einstellungen:erweiterungen") },
              { id: hostContextMenuId("extensions.reload"), icon: <RefreshIcon className="h-4 w-4" />, onSelect: refresh },
              ...(installedCurrent ? [{ id: hostContextMenuId("extensions.uninstall"), danger: true, onSelect: () => setRemoveTarget({ id: installedCurrent.id, name: example.name }) }] : []),
            ],
          })}>
            <header><div className="plugin-store-icon"><PluginIcon name={example.icon} className="h-4 w-4" /></div><div><h3>{example.name}</h3><span>{example.category} · {example.pageMode}</span></div><Badge tone="accent">Beta</Badge></header>
            <p>{example.description}</p>
            <code>{pluginHostRoute(example)}</code>
            <footer>{installedCurrent ? <><button type="button" className="quiet-button" disabled={busy || !["active", "disabled"].includes(installedCurrent.lifecycle)} onClick={() => void toggle(installedCurrent.id, installedCurrent.lifecycle)}>{busy ? "Wird geändert" : installedCurrent.lifecycle === "active" ? "Deaktivieren" : "Aktivieren"}</button><button type="button" className="quiet-button" disabled={busy || !["active", "disabled"].includes(installedCurrent.lifecycle)} onClick={() => setRemoveTarget({ id: installedCurrent.id, name: example.name })}>Deinstallieren</button></> : <button type="button" className="quiet-button-primary" disabled={busy || !entry || !storeReady} onClick={() => entry && void install(entry)}>{installLabel}</button>}</footer>
            {installedCurrent ? <small className="plugin-store-state"><span className={`plugin-state-dot is-${pluginLifecycleTone(installedCurrent.lifecycle)}`} />{pluginLifecycleLabel(installedCurrent.lifecycle)}</small> : !entry && !catalog.isLoading ? <small className="plugin-store-state"><span className="plugin-state-dot is-bad" />Paket fehlt im lokalen Catalog</small> : null}
          </article>;
        })}
      </div>
      {catalog.isLoading || registry.isLoading ? <p className="plugins-muted">Store-Status wird geladen.</p> : null}
      {examples.length === 0 && !catalog.isLoading ? <p className="plugins-muted">Noch keine lokalen Beispiele gefunden.</p> : null}
      <p className="plugins-store-note"><ExtensionsIcon className="h-3.5 w-3.5" />Der Store bleibt in v1 absichtlich lokal. Es gibt keine Remote-Quelle und jede Installation läuft über dieselbe Berechtigungs- und Lifecycle-Prüfung wie in den Einstellungen.</p>
      <ConfirmDialog open={removeTarget !== null} title={`„${removeTarget?.name ?? "Plugin"}“ deinstallieren?`} description="Das Plugin wird aus Wrapt entfernt. Die lokale Plugin-Datei im Repository bleibt erhalten." confirmLabel="Deinstallieren" danger onConfirm={() => void uninstall()} onClose={() => setRemoveTarget(null)} />
    </section>
  );
}
