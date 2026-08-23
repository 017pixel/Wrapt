import "../components/plugins/plugins.css";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { ExtensionRegistrySummary } from "@wrapt/extension-contracts";
import type { PluginDraftContent } from "@wrapt/contracts";
import { apiClient } from "../lib/apiClient";
import { wraptQueries } from "../lib/queryOptions";
import { draftFromExample, emptyPluginDraft } from "../components/plugins/pluginDefaults";
import { PluginMaker } from "../components/plugins/PluginMaker";
import { PluginOverview, pluginTabs, type PluginTabId } from "../components/plugins/PluginOverview";
import { PluginCreationChooser } from "../components/plugins/PluginCreationChooser";
import { ConfirmDialog } from "../components/ModalDialog";
import { useHashTab } from "../lib/hashTabs";

export { PluginRuntime } from "./PluginRuntime";

export function Plugins() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const examples = useQuery(wraptQueries.pluginExamples());
  const drafts = useQuery(wraptQueries.pluginDrafts());
  const catalog = useQuery(wraptQueries.extensionCatalog());
  const registry = useQuery(wraptQueries.extensionRegistry());
  const [message, setMessage] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<ExtensionRegistrySummary | null>(null);
  const [tab, setTab] = useHashTab(pluginTabs.map((item) => item.id), "plugins:", "allgemein");

  const createDraft = async (content: PluginDraftContent, mode: PluginDraftContent["creationMode"]) => {
    try {
      const response = await apiClient.createPluginDraft({ ...content, creationMode: mode });
      if (!response?.draft) throw new Error("Der Draft konnte nicht angelegt werden.");
      await client.invalidateQueries({ queryKey: ["plugins"] });
      navigate(`/plugins/maker?draft=${encodeURIComponent(response.draft.id)}&mode=${mode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Plugin-Draft konnte nicht angelegt werden.");
    }
  };

  const deactivateDraft = async (id: string) => {
    try {
      await apiClient.deactivatePluginDraft(id);
      setMessage("Plugin wurde deaktiviert und bleibt als Draft erhalten.");
      await client.invalidateQueries({ queryKey: ["plugins"] });
      await client.invalidateQueries({ queryKey: ["extensions"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Das Plugin konnte nicht deaktiviert werden.");
    }
  };

  const activateDraft = async (id: string) => {
    try {
      await apiClient.activatePluginDraft(id);
      setMessage("Plugin wurde aktiviert.");
      await client.invalidateQueries({ queryKey: ["plugins"] });
      await client.invalidateQueries({ queryKey: ["extensions"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Das Plugin konnte nicht aktiviert werden.");
    }
  };

  const deleteDraft = async (id: string) => {
    try {
      await apiClient.deletePluginDraft(id);
      setMessage("Plugin-Draft wurde gelöscht.");
      await client.invalidateQueries({ queryKey: ["plugins"] });
      await client.invalidateQueries({ queryKey: ["extensions"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Plugin-Draft konnte nicht gelöscht werden.");
    }
  };

  const runInstalledOperation = async (plugin: ExtensionRegistrySummary, operation: "enable" | "disable" | "uninstall") => {
    if (!registry.data) return;
    try {
      if (operation === "uninstall") {
        await apiClient.dispatchExtensionOperation({ operation, extensionId: plugin.id, expectedRevision: registry.data.revision, data: "delete" });
      } else {
        await apiClient.dispatchExtensionOperation({ operation, extensionId: plugin.id, expectedRevision: registry.data.revision });
      }
      setMessage(operation === "uninstall" ? `„${plugin.name}“ wurde deinstalliert.` : `„${plugin.name}“ wurde ${operation === "enable" ? "aktiviert" : "deaktiviert"}.`);
      await client.invalidateQueries({ queryKey: ["extensions"] });
      await client.invalidateQueries({ queryKey: ["plugins"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Plugin-Verwaltung ist fehlgeschlagen.");
    }
  };

  const editInstalled = async (plugin: ExtensionRegistrySummary) => {
    const slug = plugin.id.replace(/^wrapt\.(?:example|local)\./, "");
    const ownDraft = drafts.data?.drafts.find((draft) => draft.slug === slug);
    if (ownDraft) {
      setEditTarget({ id: ownDraft.id, name: ownDraft.name });
      return;
    }
    const example = examples.data?.examples.find((item) => item.slug === slug);
    if (!example) {
      setMessage("Für dieses installierte Plugin ist keine bearbeitbare Inhaltsquelle verfügbar.");
      return;
    }
    try {
      const response = await apiClient.createPluginDraft(draftFromExample(example));
      if (!response?.draft) throw new Error("Die bearbeitbare Plugin-Kopie konnte nicht angelegt werden.");
      await client.invalidateQueries({ queryKey: ["plugins"] });
      setEditTarget({ id: response.draft.id, name: response.draft.name });
      setMessage(`Eine bearbeitbare Kopie von „${plugin.name}“ wurde angelegt.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Das Plugin konnte nicht zur Bearbeitung vorbereitet werden.");
    }
  };

  const onSelectCreationMode = (mode: PluginDraftContent["creationMode"]) => {
    setChooserOpen(false);
    void createDraft(emptyPluginDraft(), mode);
  };
  const onSelectEditMode = (mode: PluginDraftContent["creationMode"]) => {
    if (!editTarget) return;
    const target = editTarget;
    setEditTarget(null);
    navigate(`/plugins/maker?draft=${encodeURIComponent(target.id)}&mode=${mode}&edit=1`);
  };
  const pluginInstalled = registry.data?.extensions.filter((item) => item.lifecycle !== "available" && (item.id.startsWith("wrapt.example.") || item.id.startsWith("wrapt.local."))) ?? [];
  return <div className="page-scroll"><div className="page-frame plugins-page">
    {message ? <div className="plugins-message" role="alert">{message}</div> : null}
    <PluginOverview activeTab={tab as PluginTabId} examples={examples.data?.examples ?? []} drafts={drafts.data?.drafts ?? []} catalogEntries={catalog.data?.entries ?? []} installed={pluginInstalled} onCreate={() => setChooserOpen(true)} onTabChange={setTab} onDeleteDraft={(id) => void deleteDraft(id)} onActivateDraft={(id) => void activateDraft(id)} onDeactivateDraft={(id) => void deactivateDraft(id)} onEditInstalled={(plugin) => void editInstalled(plugin)} onToggleInstalled={(plugin) => void runInstalledOperation(plugin, plugin.lifecycle === "active" ? "disable" : "enable")} onUninstallInstalled={setUninstallTarget} />
    <PluginCreationChooser open={chooserOpen || editTarget !== null} purpose={editTarget ? "edit" : "create"} {...(editTarget ? { pluginName: editTarget.name } : {})} onClose={() => { setChooserOpen(false); setEditTarget(null); }} onSelect={editTarget ? onSelectEditMode : onSelectCreationMode} />
    <ConfirmDialog open={uninstallTarget !== null} title={`„${uninstallTarget?.name ?? "Plugin"}“ deinstallieren?`} description="Das Plugin wird aus Wrapt entfernt. Ein eigener Draft bleibt erhalten und kann später erneut aktiviert werden." confirmLabel="Deinstallieren" danger onConfirm={() => { if (uninstallTarget) void runInstalledOperation(uninstallTarget, "uninstall"); setUninstallTarget(null); }} onClose={() => setUninstallTarget(null)} />
  </div></div>;
}

export { PluginMaker };
