import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { PluginBlock, PluginDraft, PluginDraftContent, PluginFunction } from "@wrapt/contracts";
import { ArrowLeftIcon, CheckIcon, CodeFileIcon, PlusIcon, SparklesIcon, TrashIcon } from "../icons";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { emptyPluginDraft } from "./pluginDefaults";
import { PluginAiWizard } from "./PluginAiWizard";
import { PluginCapabilityPicker } from "./PluginCapabilityPicker";
import { PluginCodeEditor } from "./PluginCodeEditor";
import { PluginHelpPopover } from "./PluginHelpPopover";
import { PluginPreview } from "./PluginPreview";
import { PluginIconPicker } from "./pluginIcons";
import { setPluginOrbitEnabled } from "./pluginSurfaceState";

function Field({ label, children, help, className = "" }: { label: string; children: ReactNode; help?: string; className?: string }) {
  return <label className={`plugin-form-field ${className}`}><span className="plugin-field-label">{label}{help ? <PluginHelpPopover title={label}>{help}</PluginHelpPopover> : null}</span>{children}</label>;
}

const blockTypes: PluginBlock["type"][] = ["heading", "text", "button", "stat", "list", "divider", "input", "select", "checkbox", "tabs", "notice", "progress", "table", "filter", "timer"];
const functionActions: PluginFunction["action"][] = ["notify", "open-route", "copy-text", "toggle-panel", "open-overlay", "open-bottom-sheet", "set-filter", "save-state", "load-state", "run-command", "activate-account", "refresh-data", "start-timer", "stop-timer", "reset-timer"];

export function PluginMaker() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const draftId = search.get("draft");
  const queryClient = useQueryClient();
  const loaded = useQuery({ ...wraptQueries.pluginDraft(draftId ?? ""), enabled: draftId !== null });
  const [draft, setDraft] = useState<PluginDraftContent>(() => emptyPluginDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hydratedDraftId, setHydratedDraftId] = useState<string | null>(null);
  const mode = (search.get("mode") ?? (search.get("ai") === "1" ? "ai" : draft.creationMode)) as PluginDraftContent["creationMode"];
  const editing = search.get("edit") === "1";

  useEffect(() => {
    if (loaded.data?.draft) {
      setDraft(loaded.data.draft);
      setHydratedDraftId(loaded.data.draft.id);
    }
  }, [loaded.data?.draft]);

  const update = (patch: Partial<PluginDraftContent>) => setDraft((current) => ({ ...current, ...patch }));
  const setPageMode = (pageMode: PluginDraftContent["pageMode"]) => update({ pageMode, iframeUrl: pageMode === "iframe" ? draft.iframeUrl : null, wizard: { ...draft.wizard, includeHtml: pageMode === "html", includeIframe: pageMode === "iframe" } });
  const updateOrbit = (patch: Partial<PluginDraftContent["orbit"]>) => setDraft((current) => ({ ...current, orbit: { ...current.orbit, ...patch } }));
  const updateBlock = (index: number, patch: Partial<PluginBlock>) => update({ blocks: draft.blocks.map((block, itemIndex) => itemIndex === index ? { ...block, ...patch } : block) });
  const updateFunction = (index: number, patch: Partial<PluginFunction>) => update({ functions: draft.functions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });

  const saveDraft = useCallback(async (silent = false): Promise<PluginDraft | null> => {
    if (!silent) setBusy(true);
    if (!silent) setMessage(null);
    try {
      const content = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "id" && key !== "createdAt" && key !== "updatedAt")) as PluginDraftContent;
      content.creationMode = mode;
      const response = draftId ? await apiClient.updatePluginDraft(draftId, content) : await apiClient.createPluginDraft(content);
      if (!response?.draft) throw new Error("Der Draft wurde nicht gespeichert.");
      setDraft(response.draft);
      setHydratedDraftId(response.draft.id);
      if (!draftId) setSearch({ draft: response.draft.id, mode }, { replace: true });
      await queryClient.invalidateQueries({ queryKey: ["plugins"] });
      if (!silent) setMessage("Draft gespeichert.");
      return response.draft;
    } catch (error) {
      if (!silent) setMessage(error instanceof ApiClientError ? error.message : "Der Draft konnte nicht gespeichert werden.");
      return null;
    } finally {
      if (!silent) setBusy(false);
    }
  }, [draft, draftId, mode, queryClient, setSearch]);

  useEffect(() => {
    if (!draftId || hydratedDraftId !== draftId) return undefined;
    const timeout = window.setTimeout(() => void saveDraft(true), 1_200);
    return () => window.clearTimeout(timeout);
  }, [draft, draftId, hydratedDraftId, mode, saveDraft]);

  const validate = async () => {
    const saved = await saveDraft();
    const id = saved?.id ?? draftId;
    if (!id) return;
    try {
      const result = await apiClient.validatePluginDraft(id);
      if (!result) throw new Error("Die Prüfung hat keine Antwort geliefert.");
      setDraft(result.draft);
      setMessage(result.valid ? "Plugin ist bereit für die Aktivierung." : result.errors.map((error) => error.message).join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Prüfung ist fehlgeschlagen.");
    }
  };

  const activate = async () => {
    const saved = await saveDraft();
    const id = saved?.id ?? draftId;
    if (!id) return;
    setBusy(true);
    try {
      const result = await apiClient.activatePluginDraft(id);
      if (!result) throw new Error("Die Aktivierung hat keine Antwort geliefert.");
      setDraft(result.draft);
      await queryClient.invalidateQueries({ queryKey: ["plugins"] });
      await queryClient.invalidateQueries({ queryKey: ["extensions"] });
      setMessage("Plugin lokal aktiviert.");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Das Plugin konnte nicht aktiviert werden.");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!draftId) return;
    setBusy(true);
    try {
      const result = await apiClient.deactivatePluginDraft(draftId);
      if (!result) throw new Error("Die Deaktivierung hat keine Antwort geliefert.");
      setDraft(result.draft);
      await queryClient.invalidateQueries({ queryKey: ["plugins"] });
      await queryClient.invalidateQueries({ queryKey: ["extensions"] });
      setMessage("Plugin lokal deaktiviert.");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Das Plugin konnte nicht deaktiviert werden.");
    } finally {
      setBusy(false);
    }
  };

  const openMode = (nextMode: PluginDraftContent["creationMode"]) => {
    const next = new URLSearchParams(search);
    next.set("mode", nextMode);
    next.delete("ai");
    setSearch(next, { replace: true });
  };

  const finishAiSetup = async () => {
    const saved = await saveDraft();
    if (saved) navigate("/plugins#plugins:allgemein");
  };

  if (draftId && hydratedDraftId !== draftId) {
    return <div className="page-scroll"><div className="page-frame plugins-page"><div className="plugins-empty"><strong>{loaded.isError ? "Draft konnte nicht geladen werden" : "Plugin wird geladen"}</strong><span>{loaded.isError ? "Öffne die Plugin-Übersicht und versuche es erneut." : "Der gespeicherte Stand wird vorbereitet."}</span>{loaded.isError ? <Link className="quiet-button" to="/plugins">Zur Plugin-Übersicht</Link> : null}</div></div></div>;
  }

  if (mode === "ai") return <div className="page-scroll"><div className="page-frame plugins-page"><PluginAiWizard {...(draftId ? { draftId } : {})} purpose={editing ? "edit" : "create"} draft={draft} onChange={setDraft} onClose={() => openMode("visual")} onComplete={finishAiSetup} /></div></div>;

  return <div className="page-scroll"><div className="page-frame plugins-page">
    <header className="plugins-maker-heading"><div><Link to="/plugins" className="plugins-back-link"><ArrowLeftIcon className="h-3.5 w-3.5" /> Plugins</Link><span className="plugins-kicker">{editing ? "Plugin-Bearbeitung" : mode === "code" ? "Lokaler Draft-Code" : "Visueller Editor"}</span><h1>{editing ? "Plugin bearbeiten" : "Plugin erstellen"}</h1><p>{editing ? "Prüfe zuerst den bestehenden Draft und beschreibe dann jede gewünschte Änderung. Die Preview zeigt den aktuellen Stand." : "Definiere zuerst Einsatzort und Fähigkeiten. Die Preview zeigt nur den aktuellen Draft."}</p></div><div className="plugins-hero-actions"><button type="button" className="quiet-button" onClick={() => openMode("ai")}><SparklesIcon className="h-4 w-4" /> KI-Prompt {editing ? "bearbeiten" : "öffnen"}</button><button type="button" className="quiet-button" onClick={() => openMode(mode === "code" ? "visual" : "code")}><CodeFileIcon className="h-4 w-4" /> {mode === "code" ? "Visuell bearbeiten" : "Code-Modus"}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => void saveDraft()}><CheckIcon className="h-4 w-4" /> {busy ? "Speichert" : "Speichern"}</button>{draft.activationStatus === "active" ? <button type="button" className="quiet-button-primary" disabled={busy} onClick={() => void deactivate()}>Deaktivieren</button> : <button type="button" className="quiet-button-primary" disabled={busy} onClick={() => void activate()}>Aktivieren</button>}</div></header>
    <div className="plugin-maker-statusbar"><span className={`plugin-status-dot is-${draft.activationStatus}`}></span><strong>{draft.activationStatus === "active" ? "Aktiv" : draft.activationStatus === "ready" ? "Bereit" : draft.activationStatus === "error" ? "Prüfung nötig" : "Lokaler Draft"}</strong><span>Autosave nach kurzer Pause</span>{message ? <span role="status">{message}</span> : null}<button type="button" className="quiet-button" onClick={() => void validate()}>Prüfen</button><button type="button" className="quiet-button" onClick={() => document.querySelector<HTMLElement>(".plugin-preview-shell")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Vorschau öffnen</button></div>
    <div className="plugins-maker-layout">
      <main className="plugin-editor-column">
        <section className="plugin-maker-panel"><div className="plugin-panel-heading"><div><span className="plugins-kicker">Grundlagen</span><h2>Plugin definieren</h2></div><PluginHelpPopover title="Grundlagen">Name, Slug und Route werden im lokalen Manifest und im KI-Prompt verwendet. Die Slug darf später nicht unkontrolliert wechseln.</PluginHelpPopover></div><div className="plugin-form-grid"><Field label="Name"><input value={draft.name} onChange={(event) => update({ name: event.target.value })} /></Field><Field label="Slug"><input value={draft.slug} onChange={(event) => update({ slug: event.target.value, routePath: `/plugins/view/${event.target.value}` })} /></Field><Field label="Beschreibung" className="is-wide"><textarea value={draft.description} onChange={(event) => update({ description: event.target.value })} /></Field><Field label="URL-Pfad" className="is-wide" help="Die Route wird als eigener Host-Pfad registriert."><input value={draft.routePath} onChange={(event) => update({ routePath: event.target.value })} /></Field><Field label="Kategorie"><input value={draft.category} onChange={(event) => update({ category: event.target.value })} /></Field><Field label="Version"><input value={draft.version} onChange={(event) => update({ version: event.target.value })} /></Field></div><PluginIconPicker value={draft.icon} onChange={(icon) => update({ icon })} /><Field label="Icon-Wunsch"><textarea value={draft.wizard.iconDescription} onChange={(event) => update({ wizard: { ...draft.wizard, iconDescription: event.target.value } })} placeholder="Welche Wirkung soll das Icon haben?" /></Field></section>
        {mode === "code" ? <PluginCodeEditor draft={draft} onChange={update} /> : <>
          <section className="plugin-maker-panel"><div className="plugin-panel-heading"><div><span className="plugins-kicker">Darstellung</span><h2>Inhalt und Ausgabe</h2></div><PluginHelpPopover title="Darstellung">Blöcke sind der sichere Standard. HTML wird bereinigt. Iframes bleiben sandboxed und erhalten keinen freien Zugriff auf Wrapt.</PluginHelpPopover></div><Field label="Seitenmodus"><select value={draft.pageMode} onChange={(event) => setPageMode(event.target.value as PluginDraftContent["pageMode"])}><option value="blocks">Blöcke und Funktionen</option><option value="html">Bereinigtes HTML</option><option value="iframe">Sandboxed Iframe</option></select></Field>{draft.pageMode === "html" ? <Field label="HTML-Inhalt"><textarea className="plugin-code-editor" value={draft.html} onChange={(event) => update({ html: event.target.value })} spellCheck={false} placeholder="<section><h2>Meine Seite</h2></section>" /></Field> : null}{draft.pageMode === "iframe" ? <Field label="Externe URL"><input type="url" value={draft.iframeUrl ?? ""} onChange={(event) => update({ iframeUrl: event.target.value || null })} placeholder="https://example.com" /></Field> : null}</section>
          {draft.pageMode === "blocks" ? <section className="plugin-maker-panel plugin-maker-panel-wide"><div className="plugin-panel-heading"><div><span className="plugins-kicker">Inhalt</span><h2>Bausteine</h2></div><div className="plugin-panel-heading-actions"><PluginHelpPopover title="Bausteine">Blöcke sind sichere, responsive UI-Teile. Verknüpfe Buttons mit einer Funktion, wenn daraus eine Aktion entstehen soll.</PluginHelpPopover><button type="button" className="quiet-button" onClick={() => update({ blocks: [...draft.blocks, { id: `block-${draft.blocks.length + 1}`, type: "text", title: "Neuer Block", content: "", actionId: null }] })}><PlusIcon className="h-3.5 w-3.5" /> Block hinzufügen</button></div></div><div className="plugin-editor-list">{draft.blocks.map((block, index) => <div className="plugin-editor-row" key={block.id}><div className="plugin-editor-row-top"><input value={block.title} onChange={(event) => updateBlock(index, { title: event.target.value })} aria-label={`Titel Block ${index + 1}`} /><select value={block.type} onChange={(event) => updateBlock(index, { type: event.target.value as PluginBlock["type"] })} aria-label={`Typ Block ${index + 1}`}>{blockTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><button type="button" className="icon-button danger" onClick={() => update({ blocks: draft.blocks.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Block ${index + 1} löschen`}><TrashIcon className="h-4 w-4" /></button></div><textarea value={block.content} onChange={(event) => updateBlock(index, { content: event.target.value })} placeholder="Inhalt" />{block.type === "button" ? <select value={block.actionId ?? ""} onChange={(event) => updateBlock(index, { actionId: event.target.value || null })}><option value="">Funktion wählen</option>{draft.functions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select> : null}</div>)}</div></section> : null}
          <section className="plugin-maker-panel"><div className="plugin-panel-heading"><div><span className="plugins-kicker">Verhalten</span><h2>Funktionen</h2></div><div className="plugin-panel-heading-actions"><PluginHelpPopover title="Funktionen">Eine Funktion ist eine deklarierte Aktion. Sie kann eine Route öffnen, einen Filter setzen, Zustand speichern oder eine Host-Aktion vorbereiten.</PluginHelpPopover><button type="button" className="quiet-button" onClick={() => update({ functions: [...draft.functions, { id: `aktion-${draft.functions.length + 1}`, label: "Neue Aktion", action: "notify", value: "Aktion ausgeführt." }] })}><PlusIcon className="h-3.5 w-3.5" /> Hinzufügen</button></div></div><div className="plugin-editor-list">{draft.functions.map((item, index) => <div className="plugin-editor-row" key={item.id}><div className="plugin-editor-row-top"><input value={item.label} onChange={(event) => updateFunction(index, { label: event.target.value })} aria-label={`Name Funktion ${index + 1}`} /><select value={item.action} onChange={(event) => updateFunction(index, { action: event.target.value as PluginFunction["action"] })}>{functionActions.map((action) => <option key={action} value={action}>{action}</option>)}</select><button type="button" className="icon-button danger" onClick={() => update({ functions: draft.functions.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Funktion ${index + 1} löschen`}><TrashIcon className="h-4 w-4" /></button></div><input value={item.value} onChange={(event) => updateFunction(index, { value: event.target.value })} placeholder="Wert oder Zielroute" /></div>)}</div></section>
        </>}
        <PluginCapabilityPicker draft={draft} onChange={update} />
        <section className="plugin-maker-panel" aria-labelledby="plugin-additional-requirements-title"><div className="plugin-panel-heading"><div><span className="plugins-kicker">Zusätzliche Angaben</span><h2 id="plugin-additional-requirements-title">Anforderungen und Neustart</h2></div><PluginHelpPopover title="Weitere Anforderungen">Diese Angaben werden auch an den KI-Weg übergeben. Beschreibe hier Abnahmekriterien, Sonderfälle und wer einen Neustart freigeben muss.</PluginHelpPopover></div><div className="plugin-form-grid"><Field label="Weitere Anforderungen" className="is-wide"><textarea value={draft.wizard.additionalRequirements} onChange={(event) => update({ wizard: { ...draft.wizard, additionalRequirements: event.target.value } })} placeholder="Abnahmekriterien, Sonderfälle und konkrete Erwartungen" /></Field><Field label="Neustart-Verhalten"><select value={draft.wizard.restartBehavior} onChange={(event) => update({ wizard: { ...draft.wizard, restartBehavior: event.target.value as PluginDraftContent["wizard"]["restartBehavior"] } })}><option value="never">Nie selbst neu starten</option><option value="ask">Vorher fragen und auf Freigabe warten</option><option value="approved">Nur nach ausdrücklicher Freigabe neu starten</option></select></Field></div></section>
        <section className="plugin-maker-panel"><div className="plugin-panel-heading"><div><span className="plugins-kicker">Orbit</span><h2>In den Orbit bringen</h2></div><PluginHelpPopover title="Orbit">Orbit ist eine zusätzliche Fläche für Nodes, Status und kontextbezogene Aktionen. Die Auswahl bleibt deklarativ.</PluginHelpPopover></div><label className="plugin-choice"><input type="checkbox" checked={draft.orbit.enabled} onChange={(event) => update(setPluginOrbitEnabled(draft, event.target.checked))} /><span><strong>Orbit-Integration aktivieren</strong><small>Die Konfiguration wird im Draft und im KI-Prompt gespeichert.</small></span></label>{draft.orbit.enabled ? <div className="plugin-form-grid"><Field label="Titel"><input value={draft.orbit.title} onChange={(event) => updateOrbit({ title: event.target.value })} /></Field><Field label="Platzierung"><select value={draft.orbit.placement} onChange={(event) => updateOrbit({ placement: event.target.value as PluginDraftContent["orbit"]["placement"] })}><option value="orbit">Orbit</option><option value="dashboard">Dashboard</option><option value="both">Beides</option></select></Field><Field label="Node-Typ"><select value={draft.orbit.nodeType} onChange={(event) => updateOrbit({ nodeType: event.target.value as PluginDraftContent["orbit"]["nodeType"] })}><option value="note">Notiz</option><option value="todo">Todo</option><option value="frame">Frame</option></select></Field><Field label="Akzent"><select value={draft.orbit.accent} onChange={(event) => updateOrbit({ accent: event.target.value as PluginDraftContent["orbit"]["accent"] })}><option value="accent">Akzent</option><option value="ok">Erfolg</option><option value="warn">Hinweis</option><option value="neutral">Neutral</option></select></Field></div> : null}</section>
      </main>
      <aside className="plugin-preview-column"><PluginPreview draft={draft} /></aside>
    </div>
  </div></div>;
}
