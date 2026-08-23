import { useState } from "react";
import type { CatalogEntry, ExtensionRegistrySummary } from "@wrapt/extension-contracts";
import type { PluginDraft, PluginExample } from "@wrapt/contracts";
import { Link, useNavigate } from "react-router";
import { ConfirmDialog } from "../ModalDialog";
import { Badge } from "../primitives";
import { CodeFileIcon, ExtensionsIcon, PlusIcon, PowerIcon, TrashIcon } from "../icons";
import { PluginStore } from "./PluginStore";
import { PluginCreatorInfo } from "./PluginCreatorInfo";
import { PluginIcon } from "./pluginIcons";
import { pluginLifecycleLabel, pluginLifecycleTone } from "./pluginLifecycle";
import { pluginHostRoute } from "./pluginSurfaceState";
import { openGlobalContextMenu } from "../context-menu/contextMenuEvents";
import { hostContextMenuId } from "../../extensions/hostContextMenus";
import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";

export type PluginTabId = "allgemein" | "eigene" | "store" | "installiert";

export const pluginTabs: { id: PluginTabId; label: string }[] = [
  { id: "allgemein", label: "Allgemein" },
  { id: "eigene", label: "Eigene Plugins" },
  { id: "store", label: "Installieren" },
  { id: "installiert", label: "Installierte Plugins" },
];

interface PluginOverviewProps {
  activeTab: PluginTabId;
  examples: PluginExample[];
  drafts: PluginDraft[];
  catalogEntries: CatalogEntry[];
  installed: ExtensionRegistrySummary[];
  onCreate: () => void;
  onTabChange: (tab: PluginTabId) => void;
  onDeleteDraft: (id: string) => void;
  onActivateDraft?: (id: string) => void;
  onDeactivateDraft: (id: string) => void;
  onEditInstalled?: (plugin: ExtensionRegistrySummary) => void;
  onToggleInstalled?: (plugin: ExtensionRegistrySummary) => void;
  onUninstallInstalled?: (plugin: ExtensionRegistrySummary) => void;
}

function stat(label: string, value: number, detail: string, tone = "") {
  return <article className={`plugins-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function draftTone(status: PluginDraft["activationStatus"]): "default" | "ok" | "warn" | "bad" {
  if (status === "active") return "ok";
  if (status === "disabled") return "warn";
  if (status === "error") return "bad";
  return "default";
}

function draftLabel(status: PluginDraft["activationStatus"]): string {
  if (status === "active") return "Aktiv";
  if (status === "disabled") return "Deaktiviert";
  if (status === "error") return "Prüfung nötig";
  return "Draft";
}

export function PluginOverview({ activeTab, examples, drafts, catalogEntries, installed, onCreate, onTabChange, onDeleteDraft, onActivateDraft = () => undefined, onDeactivateDraft, onEditInstalled = () => undefined, onToggleInstalled = () => undefined, onUninstallInstalled = () => undefined }: PluginOverviewProps) {
  const navigate = useNavigate();
  const navigation = useNavigationRegistry();
  const [deleteTarget, setDeleteTarget] = useState<PluginDraft | null>(null);
  const active = installed.filter((item) => item.lifecycle === "active").length;
  const disabled = installed.filter((item) => item.lifecycle === "disabled").length;
  const errors = installed.filter((item) => ["crashed", "quarantined", "incompatible", "migration-failed"].includes(item.lifecycle)).length;

  return <>
    <header className="plugins-hero"><div><span className="plugins-kicker">Lokale Erweiterungen · Beta</span><h1>Plugins</h1><p>Erweitere Wrapt mit eigenen Seiten, Panels, Aktionen und kleinen Werkzeugen. Die KI ist der empfohlene Startpunkt.</p></div><div className="plugins-hero-actions"><button type="button" className="quiet-button-primary" onClick={onCreate}><PlusIcon className="h-4 w-4" /> Neues Plugin erstellen</button></div></header>
    <nav className="plugins-tabs" aria-label="Plugin-Bereiche">
      {pluginTabs.map(({ id, label }) => <button key={id} type="button" aria-pressed={activeTab === id} className={`plugins-tab ${activeTab === id ? "is-active" : ""}`} onClick={() => onTabChange(id)}>{label}</button>)}
    </nav>

    {activeTab === "allgemein" ? <>
      <section className="plugins-kpi-grid" aria-label="Plugin-Status">
        {stat("Aktiv", active, "läuft in Wrapt", "is-ok")}
        {stat("Deaktiviert", disabled, "installiert, aber pausiert", "is-warn")}
        {stat("Mit Fehlern", errors, errors > 0 ? "Prüfung nötig" : "keine kritischen Zustände", errors > 0 ? "is-bad" : "")}
        {stat("Im lokalen Store", catalogEntries.length, "Catalog-Pakete verfügbar", "is-accent")}
      </section>
      <section className="plugins-quick-grid" aria-label="Plugin-Bereiche öffnen">
        <article className="plugins-quick-card"><span className="plugins-kicker">Arbeitsbereich</span><h2>Eigene Plugins</h2><p>{drafts.length} gespeicherte Drafts und lokal aktivierte Seiten.</p><button type="button" className="quiet-button" onClick={() => onTabChange("eigene")}>Eigene Plugins öffnen</button></article>
        <article className="plugins-quick-card"><span className="plugins-kicker">Lokaler Beta-Store</span><h2>Plugins installieren</h2><p>{examples.length} lokale Beispiele stehen direkt zum Installieren bereit.</p><button type="button" className="quiet-button" onClick={() => onTabChange("store")}>Store öffnen</button></article>
        <article className="plugins-quick-card"><span className="plugins-kicker">Verwaltung</span><h2>Installierte Plugins</h2><p>{installed.length} installierte Erweiterungen und ihre aktuellen Zustände.</p><button type="button" className="quiet-button" onClick={() => onTabChange("installiert")}>Installierte Plugins öffnen</button></article>
      </section>
      <PluginCreatorInfo />
    </> : null}

    {activeTab === "eigene" ? <section className="plugins-section plugins-tab-section" aria-labelledby="own-plugins-title">
      <header className="plugins-section-heading"><div><span className="plugins-kicker">Arbeitsbereich</span><h2 id="own-plugins-title">Eigene Plugins</h2><p>Deine gespeicherten Drafts und lokal aktivierten Seiten.</p></div><span className="plugins-section-count">{drafts.length}</span></header>
      {drafts.length > 0 ? <div className="plugins-draft-list">{drafts.map((draft) => {
        const ownerId = `wrapt.local.${draft.slug}`;
        const quickActionToolId = navigation.items.find((item) => item.ownerId === ownerId)?.contributionId;
        return <article className="plugins-installed-row plugin-draft-row" key={draft.id} onContextMenu={(event) => openGlobalContextMenu(event, {
          surface: "host.context-menu.extensions",
          title: draft.name,
          ...(quickActionToolId ? { quickActionToolId } : {}),
          actions: [
            { id: hostContextMenuId("extensions.toggle"), label: draft.activationStatus === "active" ? "Deaktivieren" : "Aktivieren", checked: draft.activationStatus === "active", onSelect: () => draft.activationStatus === "active" ? onDeactivateDraft(draft.id) : onActivateDraft(draft.id) },
            { id: hostContextMenuId("extensions.edit"), icon: <CodeFileIcon className="h-4 w-4" />, onSelect: () => navigate(`/plugins/maker?draft=${encodeURIComponent(draft.id)}&mode=${draft.creationMode}`) },
            { id: hostContextMenuId("extensions.settings"), onSelect: () => navigate("/settings#einstellungen:erweiterungen") },
            { id: hostContextMenuId("extensions.reload"), onSelect: () => window.location.reload() },
            { id: hostContextMenuId("extensions.uninstall"), label: "Draft löschen", icon: <TrashIcon className="h-4 w-4" />, danger: true, onSelect: () => setDeleteTarget(draft) },
          ],
        })}>
        <div className="plugin-draft-identity"><span className="plugins-installed-icon"><PluginIcon name={draft.icon} className="h-4 w-4" /></span><span><h3>{draft.name}</h3><span>{draft.slug} · zuletzt geändert {new Date(draft.updatedAt).toLocaleDateString("de-DE")}</span><p>{draft.description}</p><code>{pluginHostRoute(draft)}</code></span></div>
        <Badge tone={draftTone(draft.activationStatus)}>{draftLabel(draft.activationStatus)}</Badge>
        <footer className="plugins-installed-actions"><Link className="quiet-button" to={`/plugins/maker?draft=${encodeURIComponent(draft.id)}&mode=${draft.creationMode}`}><CodeFileIcon className="h-3.5 w-3.5" /> Bearbeiten</Link>{draft.activationStatus === "active" ? <><button type="button" className="quiet-button" onClick={() => onDeactivateDraft(draft.id)} aria-label={`Plugin „${draft.name}“ deaktivieren`}><PowerIcon className="h-3.5 w-3.5" /> Deaktivieren</button><Link className="quiet-button" to={pluginHostRoute(draft)}>Seite öffnen</Link></> : <button type="button" className="quiet-button" onClick={() => onActivateDraft(draft.id)} aria-label={`Plugin „${draft.name}“ aktivieren`}><PowerIcon className="h-3.5 w-3.5" /> Aktivieren</button>}<button type="button" className="quiet-button plugin-draft-delete" onClick={() => setDeleteTarget(draft)} aria-label={`Plugin „${draft.name}“ löschen`}><TrashIcon className="h-3.5 w-3.5" /> Löschen</button></footer>
      </article>;
      })}</div> : <div className="plugins-empty"><ExtensionsIcon className="h-5 w-5" /><strong>Noch kein eigenes Plugin</strong><span>Starte mit dem empfohlenen KI-Prompt oder erstelle es visuell.</span><button type="button" className="quiet-button-primary" onClick={onCreate}>Ersten Draft anlegen</button></div>}
    </section> : null}

    {activeTab === "store" ? <PluginStore examples={examples} /> : null}

    {activeTab === "installiert" ? <section className="plugins-section plugins-tab-section" aria-labelledby="installed-plugins-title">
      <header className="plugins-section-heading"><div><span className="plugins-kicker">Verwaltung</span><h2 id="installed-plugins-title">Installierte Plugins</h2><p>Verwalte installierte Erweiterungen und prüfe ihren Zustand.</p></div><span className="plugins-section-count">{installed.length}</span></header>
      {installed.length > 0 ? <div className="plugins-installed-list">{installed.map((plugin) => {
        const slug = plugin.id.replace(/^wrapt\.(?:example|local)\./, "");
        const isPlugin = plugin.id.startsWith("wrapt.example.") || plugin.id.startsWith("wrapt.local.");
        const source = drafts.find((item) => item.slug === slug) ?? examples.find((item) => item.slug === slug);
        const openPath = source ? pluginHostRoute(source) : `/plugins/view/${encodeURIComponent(slug)}`;
        const quickActionToolId = navigation.items.find((item) => item.ownerId === plugin.id)?.contributionId;
        return <div className="plugins-installed-row" key={plugin.id} onContextMenu={(event) => isPlugin && openGlobalContextMenu(event, {
          surface: "host.context-menu.extensions",
          title: plugin.name,
          ...(quickActionToolId ? { quickActionToolId } : {}),
          actions: [
            { id: hostContextMenuId("extensions.toggle"), label: plugin.lifecycle === "active" ? "Deaktivieren" : "Aktivieren", checked: plugin.lifecycle === "active", disabled: !["active", "disabled"].includes(plugin.lifecycle), onSelect: () => onToggleInstalled(plugin) },
            { id: hostContextMenuId("extensions.edit"), icon: <CodeFileIcon className="h-4 w-4" />, onSelect: () => onEditInstalled(plugin) },
            { id: hostContextMenuId("extensions.settings"), onSelect: () => navigate("/settings#einstellungen:erweiterungen") },
            { id: hostContextMenuId("extensions.reload"), onSelect: () => window.location.reload() },
            { id: hostContextMenuId("extensions.uninstall"), icon: <TrashIcon className="h-4 w-4" />, danger: true, onSelect: () => onUninstallInstalled(plugin) },
          ],
        })}><div className="plugins-installed-identity">{isPlugin ? <span className="plugins-installed-icon"><PluginIcon name={source?.icon} className="h-4 w-4" /></span> : null}<span><strong>{plugin.name}</strong><span>{plugin.id}</span></span></div><Badge tone={pluginLifecycleTone(plugin.lifecycle)}>{pluginLifecycleLabel(plugin.lifecycle)}</Badge><div className="plugins-installed-actions">{isPlugin ? <button type="button" className="quiet-button" onClick={() => onEditInstalled(plugin)} aria-label={`${plugin.name} bearbeiten`}><CodeFileIcon className="h-3.5 w-3.5" /> Bearbeiten</button> : null}{isPlugin && (plugin.lifecycle === "active" || plugin.lifecycle === "disabled") ? <button type="button" className="quiet-button" onClick={() => onToggleInstalled(plugin)} aria-label={`${plugin.name} ${plugin.lifecycle === "active" ? "deaktivieren" : "aktivieren"}`}><PowerIcon className="h-3.5 w-3.5" /> {plugin.lifecycle === "active" ? "Deaktivieren" : "Aktivieren"}</button> : null}{isPlugin ? <Link className="quiet-button" to={openPath}>Seite öffnen</Link> : null}{isPlugin ? <button type="button" className="quiet-button plugin-draft-delete" onClick={() => onUninstallInstalled(plugin)} aria-label={`${plugin.name} deinstallieren`}><TrashIcon className="h-3.5 w-3.5" /> Deinstallieren</button> : null}</div></div>;
      })}</div> : <p className="plugins-muted">Noch kein Plugin installiert. Öffne den Tab „Installieren“, um ein lokales Beispiel hinzuzufügen.</p>}
    </section> : null}

    <ConfirmDialog open={deleteTarget !== null} title={`„${deleteTarget?.name ?? "Plugin"}“ löschen?`} description="Der Draft und das lokal erzeugte Plugin-Paket werden entfernt. Diese Aktion kann nicht rückgängig gemacht werden." confirmLabel="Endgültig löschen" danger onConfirm={() => { if (deleteTarget) onDeleteDraft(deleteTarget.id); setDeleteTarget(null); }} onClose={() => setDeleteTarget(null)} />
  </>;
}
