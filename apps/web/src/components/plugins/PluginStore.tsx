import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogEntry, ExtensionId, ExtensionLifecycleState } from "@wrapt/extension-contracts";
import type { PluginExample } from "@wrapt/contracts";
import { Link } from "react-router";
import { ExtensionsIcon, RefreshIcon } from "../icons";
import { Badge } from "../primitives";
import { ConfirmDialog } from "../ModalDialog";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { PluginIcon } from "./pluginIcons";
import { pluginHostRoute } from "./pluginSurfaceState";

const lifecycleLabels: Partial<Record<ExtensionLifecycleState, string>> = {
  active: "Aktiv",
  disabled: "Deaktiviert",
  installed: "Installiert",
  "permissions-pending": "Berechtigungen offen",
  crashed: "Fehler",
  quarantined: "Quarantäne",
};

function toneFor(lifecycle: ExtensionLifecycleState): "default" | "ok" | "warn" | "bad" {
  if (lifecycle === "active") return "ok";
  if (["crashed", "quarantined", "incompatible", "migration-failed"].includes(lifecycle)) return "bad";
  if (["disabled", "installed", "permissions-pending"].includes(lifecycle)) return "warn";
  return "default";
}

interface PluginStoreProps {
  examples: PluginExample[];
}

export function PluginStore({ examples }: PluginStoreProps) {
  const queryClient = useQueryClient();
  const catalog = useQuery(wraptQueries.extensionCatalog());
  const registry = useQuery(wraptQueries.extensionRegistry());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: ExtensionId; name: string } | null>(null);
  const installed = new Map((registry.data?.extensions ?? []).map((extension) => [extension.id, extension]));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["extensions"] });
  };

  const install = async (entry: CatalogEntry) => {
    if (!catalog.data || !registry.data) return;
    setBusyId(entry.manifest.id);
    setMessage(null);
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
      setMessage(`„${entry.manifest.name}“ wurde hinzugefügt.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Das Plugin konnte nicht hinzugefügt werden.");
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
      refresh();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Der Status konnte nicht geändert werden.");
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const uninstall = async () => {
    if (!registry.data || !removeTarget) return;
    setBusyId(removeTarget.id);
    setMessage(null);
    try {
      await apiClient.dispatchExtensionOperation({ operation: "uninstall", extensionId: removeTarget.id, expectedRevision: registry.data.revision, data: "delete" });
      setMessage(`„${removeTarget.name}“ wurde entfernt.`);
      setRemoveTarget(null);
      refresh();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Das Plugin konnte nicht entfernt werden.");
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="plugins-section plugins-tab-section" aria-labelledby="plugin-store-title">
      <header className="plugins-section-heading"><div><span className="plugins-kicker">Lokaler Beta-Store</span><h2 id="plugin-store-title">Plugins installieren</h2><p>{examples.length} lokale Plugins aus <code>extensions/plugins</code>. Installiere ein Beispiel direkt für deine lokale Workbench.</p></div><button type="button" className="icon-button" onClick={refresh} aria-label="Plugin-Store aktualisieren" title="Aktualisieren"><RefreshIcon className="h-4 w-4" /></button></header>
      {message ? <div className="plugins-message" role="status"><span>{message}</span><Link className="quiet-button" to="/settings#einstellungen:system">Wrapt neu starten</Link></div> : null}
      <div className="plugins-store-grid">
        {examples.map((example) => {
          const entry = catalog.data?.entries.find((item) => item.manifest.id === `wrapt.example.${example.exampleId}`);
          const current = entry ? installed.get(entry.manifest.id) : undefined;
          const installedCurrent = current && current.lifecycle !== "available" ? current : undefined;
          const busy = busyId === entry?.manifest.id;
          return <article className="plugin-store-card" key={example.exampleId}>
            <header><div className="plugin-store-icon"><PluginIcon name={example.icon} className="h-4 w-4" /></div><div><h3>{example.name}</h3><span>{example.category} · {example.pageMode}</span></div><Badge tone="accent">Beta</Badge></header>
            <p>{example.description}</p>
            <code>{pluginHostRoute(example)}</code>
            <footer>{installedCurrent ? <><button type="button" className="quiet-button" disabled={busy || !["active", "disabled"].includes(installedCurrent.lifecycle)} onClick={() => void toggle(installedCurrent.id, installedCurrent.lifecycle)}>{busy ? "Wird geändert" : installedCurrent.lifecycle === "active" ? "Deaktivieren" : "Aktivieren"}</button><button type="button" className="quiet-button" disabled={busy || !["active", "disabled"].includes(installedCurrent.lifecycle)} onClick={() => setRemoveTarget({ id: installedCurrent.id, name: example.name })}>Deinstallieren</button></> : <button type="button" className="quiet-button-primary" disabled={busy || !entry} onClick={() => entry && void install(entry)}>{busy ? "Wird installiert" : "Installieren"}</button>}</footer>
            {installedCurrent ? <small className="plugin-store-state"><span className={`plugin-state-dot is-${toneFor(installedCurrent.lifecycle)}`} />{lifecycleLabels[installedCurrent.lifecycle] ?? installedCurrent.lifecycle}</small> : null}
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
