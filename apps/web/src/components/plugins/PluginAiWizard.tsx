import { useState, type ReactNode } from "react";
import type { PluginDraftContent, PluginSurface, PluginWizardAnswers } from "@wrapt/contracts";
import { extensionPermissionIds, extensionPermissionRiskById } from "@wrapt/extension-contracts";
import { CheckIcon, CloseIcon, CopyIcon, SparklesIcon } from "../icons";
import { buildPluginAgentPrompt } from "./pluginPrompt";
import { PluginHelpPopover } from "./PluginHelpPopover";
import { PluginPreview } from "./PluginPreview";
import { PluginIconPicker } from "./pluginIcons";
import { pluginHostRoute, togglePluginSurface } from "./pluginSurfaceState";

const steps = ["Grundlagen", "Ziel", "Einsatzort", "Design", "Fähigkeiten", "Rechte", "Vorschau", "Prompt"] as const;

const surfaceOptions: Array<{ value: PluginSurface; label: string; description: string }> = [
  { value: "sidebar", label: "Seite in der Sidebar", description: "Sichtbare Werkzeugseite links in der Navigation. Für neue Plugins empfohlen." },
  { value: "topbar", label: "Topbar", description: "Status oder Schnellaktion oben." },
  { value: "bottom-bar", label: "Bottom-Bar", description: "Zähler, Status oder Aktion unten." },
  { value: "dashboard", label: "Dashboard", description: "Karte, Metrik oder Quick Action." },
  { value: "orbit", label: "Orbit", description: "Node, Inspector oder Orbit-Aktion." },
  { value: "right-rail", label: "Rechte Seitenleiste", description: "Kontrolliertes Panel neben dem Inhalt." },
  { value: "overlay", label: "Overlay", description: "Kontextbezogene Zusatzfläche." },
  { value: "bottom-sheet", label: "Bottom Sheet", description: "Mobile Fläche für Details und Aktionen." },
  { value: "context-menu", label: "Kontextmenü", description: "Aktion am aktuellen Host-Kontext." },
  { value: "preview", label: "Preview", description: "Anzeige oder Aktion für eine Preview." },
];
const primarySurface = surfaceOptions[0]!;
const additionalSurfaces = surfaceOptions.slice(1);

const designOptions: Array<{ value: PluginWizardAnswers["design"]; label: string }> = [
  { value: "klar", label: "Klar" },
  { value: "kompakt", label: "Kompakt" },
  { value: "editorial", label: "Editorial" },
  { value: "technisch", label: "Technisch" },
  { value: "eigen", label: "Eigener Stil" },
];

const layoutOptions: Array<{ value: PluginWizardAnswers["layout"]; label: string }> = [
  { value: "einspaltig", label: "Einspaltig" },
  { value: "zweispaltig", label: "Zweispaltig" },
  { value: "dashboard", label: "Dashboard" },
  { value: "frei", label: "Frei" },
];

const toneOptions: Array<{ value: PluginWizardAnswers["tone"]; label: string }> = [
  { value: "ruhig", label: "Ruhig" },
  { value: "direkt", label: "Direkt" },
  { value: "freundlich", label: "Freundlich" },
  { value: "fokussiert", label: "Fokussiert" },
];

const mobileOptions: Array<{ value: PluginWizardAnswers["mobileBehavior"]; label: string }> = [
  { value: "responsive", label: "Responsive" },
  { value: "bottom-sheet", label: "Bottom Sheet" },
  { value: "full-screen", label: "Vollbild" },
];

function Field({ label, children, help, className = "" }: { label: string; children: ReactNode; help?: string; className?: string }) {
  return <label className={`plugin-form-field ${className}`}><span className="plugin-field-label">{label}{help ? <PluginHelpPopover title={label}>{help}</PluginHelpPopover> : null}</span>{children}</label>;
}

function ChoiceCards<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: Array<{ value: T; label: string; description?: string }>; onChange: (value: T) => void }) {
  return <div className="plugin-ai-choice-grid">{options.map((option) => <label className={`plugin-ai-option ${value === option.value ? "is-selected" : ""}`} key={option.value}><input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} /><span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span></label>)}</div>;
}

interface PluginAiWizardProps {
  draftId?: string;
  draft: PluginDraftContent;
  onChange: (draft: PluginDraftContent) => void;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
  purpose?: "create" | "edit";
}

export function PluginAiWizard({ draftId, draft, onChange, onClose, onComplete, purpose = "create" }: PluginAiWizardProps) {
  const editMode = purpose === "edit";
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const prompt = buildPluginAgentPrompt(
    { ...draft, creationMode: "ai" },
    {
      mode: editMode ? "edit" : "create",
      requestedChanges: draft.wizard.editRequest,
      ...(draftId ? { draftId } : {}),
    },
  );

  const changeDraft = (patch: Partial<PluginDraftContent>) => {
    setCopied(false);
    setCopyError(null);
    onChange({ ...draft, ...patch, creationMode: "ai" });
  };

  const updateWizard = (patch: Partial<PluginWizardAnswers>) => changeDraft({ wizard: { ...draft.wizard, ...patch } });

  const setPageMode = (pageMode: PluginDraftContent["pageMode"]) => changeDraft({
    pageMode,
    iframeUrl: pageMode === "iframe" ? draft.iframeUrl : null,
    wizard: {
      ...draft.wizard,
      includeHtml: pageMode === "html",
      includeIframe: pageMode === "iframe",
    },
  });

  const toggleSurface = (surface: PluginSurface) => {
    changeDraft(togglePluginSurface(draft, surface));
  };

  const copyPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Zwischenablage nicht verfügbar");
      await navigator.clipboard.writeText(prompt);
      setCopyError(null);
      setCopied(true);
    } catch {
      setCopyError("Der Prompt konnte nicht in die Zwischenablage kopiert werden.");
    }
  };

  const complete = async () => {
    setFinishing(true);
    try {
      await onComplete();
    } catch {
      setCopyError("Die Plugin-Übersicht konnte nicht geöffnet werden.");
    } finally {
      setFinishing(false);
    }
  };

  const renderBasics = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 1</span><h3>Plugin-Grundlagen</h3></div><PluginHelpPopover title="Grundlagen">Diese Angaben stehen später im lokalen Manifest, in der Übersicht und im Prompt. Wähle den Inhaltsmodus schon jetzt passend zu deiner Idee.</PluginHelpPopover></div>
    <div className="plugin-form-grid">
      <Field label="Name"><input aria-label="Name" value={draft.name} onChange={(event) => changeDraft({ name: event.target.value })} /></Field>
      <Field label="Slug"><input aria-label="Slug" value={draft.slug} onChange={(event) => changeDraft({ slug: event.target.value, routePath: `/plugins/view/${event.target.value}` })} /></Field>
      <Field label="Beschreibung" className="is-wide"><textarea aria-label="Beschreibung" value={draft.description} onChange={(event) => changeDraft({ description: event.target.value })} /></Field>
      <Field label="Kategorie"><input aria-label="Kategorie" value={draft.category} onChange={(event) => changeDraft({ category: event.target.value })} /></Field>
      <Field label="Version"><input aria-label="Version" value={draft.version} onChange={(event) => changeDraft({ version: event.target.value })} /></Field>
      <Field label="URL-Pfad" className="is-wide"><input aria-label="URL-Pfad" value={draft.routePath} onChange={(event) => changeDraft({ routePath: event.target.value })} /></Field>
      <Field label="Inhaltsmodus" className="is-wide"><select aria-label="Inhaltsmodus" value={draft.pageMode} onChange={(event) => setPageMode(event.target.value as PluginDraftContent["pageMode"])}><option value="blocks">Blöcke und Funktionen</option><option value="html">Bereinigtes HTML</option><option value="iframe">Sandboxed Iframe</option></select></Field>
      {draft.pageMode === "iframe" ? <Field label="Externe Iframe-URL" className="is-wide"><input aria-label="Externe Iframe-URL" type="url" value={draft.iframeUrl ?? ""} onChange={(event) => changeDraft({ iframeUrl: event.target.value || null })} placeholder="https://example.com" /></Field> : null}
    </div>
    <PluginIconPicker value={draft.icon} onChange={(icon) => changeDraft({ icon })} />
    <Field label="Icon-Wunsch" className="plugin-ai-form-spaced"><textarea aria-label="Icon-Wunsch" value={draft.wizard.iconDescription} onChange={(event) => updateWizard({ iconDescription: event.target.value })} placeholder="Zum Beispiel: ruhige Uhr für einen Fokus-Timer" /></Field>
  </>;

  const renderGoal = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 2</span><h3>{editMode ? "Was soll geändert werden?" : "Was soll entstehen?"}</h3></div><PluginHelpPopover title={editMode ? "Änderungen" : "Ziel"}>{editMode ? "Ein Satz zur gewünschten Änderung genügt. Der Agent soll das bestehende Plugin lesen, erhaltene Funktionen bewahren und nur die nötigen Werte anpassen." : "Ein grober Ein-Satz-Auftrag genügt. Der KI-Agent leitet daraus eine passende Oberfläche, sinnvolle Aktionen und sichere Zustände ab."}</PluginHelpPopover></div>
    <div className="plugin-form-grid">{editMode ? <Field label="Änderungsauftrag in einem Satz" className="is-wide"><textarea aria-label="Änderungsauftrag in einem Satz" value={draft.wizard.editRequest} onChange={(event) => updateWizard({ editRequest: event.target.value })} placeholder="Was soll besser, anders oder zusätzlich funktionieren?" /></Field> : null}<Field label="Auftrag in einem Satz" className="is-wide"><textarea aria-label="Auftrag in einem Satz" value={draft.wizard.goal} onChange={(event) => updateWizard({ goal: event.target.value })} placeholder="Zum Beispiel: Zeige mir oben den aktiven KI-Account und lasse mich wechseln." /></Field><Field label="Zielgruppe"><textarea aria-label="Zielgruppe" value={draft.wizard.audience} onChange={(event) => updateWizard({ audience: event.target.value })} placeholder="Wer nutzt es?" /></Field><Field label="Weitere Beschreibung"><textarea aria-label="Weitere Beschreibung" value={draft.wizard.additionalDescription} onChange={(event) => updateWizard({ additionalDescription: event.target.value })} placeholder="Wichtige Details, Beispiele oder Grenzen" /></Field></div>
  </>;

  const renderSurfaces = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 3</span><h3>Wo soll es sichtbar sein?</h3></div><PluginHelpPopover title="Host-Oberflächen">Wähle eine eigene Seite oder ergänze kleine Flächen in Wrapt. Der KI-Agent erhält diese Auswahl als kontrollierte Host-Slots.</PluginHelpPopover></div>
    <div className="plugin-ai-choice-grid"><label className={`plugin-ai-option ${draft.surfaces.includes(primarySurface.value) ? "is-selected" : ""}`}><input type="checkbox" checked={draft.surfaces.includes(primarySurface.value)} onChange={() => toggleSurface(primarySurface.value)} /><span><strong>{primarySurface.label}</strong><small>{primarySurface.description}</small></span></label></div>
    <details className="plugin-ai-more"><summary>Weitere Flächen</summary><div className="plugin-ai-choice-grid">{additionalSurfaces.map((option) => <label className={`plugin-ai-option ${draft.surfaces.includes(option.value) ? "is-selected" : ""}`} key={option.value}><input type="checkbox" checked={draft.surfaces.includes(option.value)} onChange={() => toggleSurface(option.value)} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></details>
  </>;

  const renderDesign = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 4</span><h3>Wie soll es sich anfühlen?</h3></div><PluginHelpPopover title="Design">Diese Auswahl ist eine Richtung für den KI-Agenten. Das Plugin übernimmt trotzdem die Wrapt-Tokens und deine Projektfarben.</PluginHelpPopover></div>
    <div className="plugin-ai-subsection"><span className="plugin-field-label">Designrichtung</span><ChoiceCards name="plugin-design" value={draft.wizard.design} options={designOptions} onChange={(design) => updateWizard({ design })} /></div>
    <div className="plugin-ai-subsection"><span className="plugin-field-label">Layout</span><ChoiceCards name="plugin-layout" value={draft.wizard.layout} options={layoutOptions} onChange={(layout) => updateWizard({ layout })} /></div>
    <div className="plugin-ai-subsection"><span className="plugin-field-label">Ton</span><ChoiceCards name="plugin-tone" value={draft.wizard.tone} options={toneOptions} onChange={(tone) => updateWizard({ tone })} /></div>
    <div className="plugin-ai-subsection"><span className="plugin-field-label">Mobile-Verhalten</span><ChoiceCards name="plugin-mobile" value={draft.wizard.mobileBehavior} options={mobileOptions} onChange={(mobileBehavior) => updateWizard({ mobileBehavior })} /></div>
  </>;

  const renderCapabilities = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 5</span><h3>Welche Fähigkeiten werden gebraucht?</h3></div><PluginHelpPopover title="Fähigkeiten">Hier beschreibst du zusätzliche Möglichkeiten. Der KI-Agent entscheidet daraus, welche sicheren Aktionen und Host-Tools wirklich nötig sind.</PluginHelpPopover></div>
    <div className="plugin-ai-choice-grid"><label className={`plugin-ai-option ${draft.wizard.includeHtml ? "is-selected" : ""}`}><input type="checkbox" checked={draft.wizard.includeHtml} onChange={(event) => setPageMode(event.target.checked ? "html" : draft.pageMode === "html" ? "blocks" : draft.pageMode)} /><span><strong>HTML verwenden</strong><small>Der Inhaltsmodus wird auf bereinigtes HTML gesetzt.</small></span></label><label className={`plugin-ai-option ${draft.wizard.includeIframe ? "is-selected" : ""}`}><input type="checkbox" checked={draft.wizard.includeIframe} onChange={(event) => setPageMode(event.target.checked ? "iframe" : draft.pageMode === "iframe" ? "blocks" : draft.pageMode)} /><span><strong>Iframe verwenden</strong><small>Der Inhaltsmodus wird auf ein sandboxed Iframe gesetzt.</small></span></label><label className={`plugin-ai-option ${draft.wizard.includeOrbit ? "is-selected" : ""}`}><input type="checkbox" checked={draft.wizard.includeOrbit} onChange={() => toggleSurface("orbit")} /><span><strong>Orbit verbinden</strong><small>Node oder Aktion im Orbit verfügbar machen.</small></span></label></div>
    <div className="plugin-form-grid plugin-ai-form-spaced"><Field label="Datenbedarf"><input aria-label="Datenbedarf" value={draft.wizard.dataNeeds.join(", ")} onChange={(event) => updateWizard({ dataNeeds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="z. B. Projekte, Dateien, Status" /></Field><Field label="Interaktionen"><input aria-label="Interaktionen" value={draft.wizard.interactions.join(", ")} onChange={(event) => updateWizard({ interactions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="z. B. filtern, kopieren, öffnen" /></Field></div>
  </>;

  const renderPermissions = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 6</span><h3>Agent und Rechte</h3></div><PluginHelpPopover title="Rechte">Wähle nur Rechte, die für das Plugin nötig sind. Der KI-Agent soll immer den kleinsten sinnvollen Umfang verwenden.</PluginHelpPopover></div>
    <Field label="Bevorzugter KI-Agent"><select aria-label="Bevorzugter KI-Agent" value={draft.wizard.agent} onChange={(event) => updateWizard({ agent: event.target.value as PluginWizardAnswers["agent"] })}><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="opencode">OpenCode</option><option value="anderer">Andere KI</option></select></Field>
    <div className="plugin-permissions"><span>Optionale Berechtigungen</span>{extensionPermissionIds.map((permission) => <label key={permission}><input type="checkbox" checked={draft.wizard.permissions.includes(permission)} onChange={(event) => updateWizard({ permissions: event.target.checked ? [...draft.wizard.permissions, permission] : draft.wizard.permissions.filter((item) => item !== permission) })} /><span><strong>{permission}</strong><small>{extensionPermissionRiskById[permission]}</small></span></label>)}</div>
    <Field label={editMode ? "Eigene Wünsche zur Änderung" : "Eigene Wünsche"} className="plugin-ai-form-spaced"><textarea aria-label={editMode ? "Eigene Wünsche zur Änderung" : "Eigene Wünsche"} value={draft.wizard.wishes} onChange={(event) => updateWizard({ wishes: event.target.value })} placeholder={editMode ? "Was darf beim Bearbeiten nicht verloren gehen?" : "Was darf der Agent auf keinen Fall vergessen?"} /></Field>
    <section className="plugin-ai-detail-section" aria-labelledby="plugin-additional-requirements-title">
      <div className="plugin-panel-heading"><div><span className="plugins-kicker">Zusätzliche Angaben</span><h3 id="plugin-additional-requirements-title">Anforderungen an die Umsetzung</h3></div><PluginHelpPopover title="Weitere Anforderungen">Hier gehören konkrete Regeln, Beispiele, Abnahmekriterien und Dinge hinein, die nicht in die Rechte gehören. Dieser Text wird vollständig in den KI-Prompt übernommen.</PluginHelpPopover></div>
      <Field label="Weitere Anforderungen"><textarea aria-label="Weitere Anforderungen" value={draft.wizard.additionalRequirements} onChange={(event) => updateWizard({ additionalRequirements: event.target.value })} placeholder="Zum Beispiel: Welche Zustände müssen sichtbar sein? Welche Fehlerfälle und mobilen Abläufe müssen getestet werden?" /></Field>
      <Field label="Neustart-Verhalten"><select aria-label="Neustart-Verhalten" value={draft.wizard.restartBehavior} onChange={(event) => updateWizard({ restartBehavior: event.target.value as PluginWizardAnswers["restartBehavior"] })}><option value="never">Nie selbst neu starten</option><option value="ask">Vorher fragen und auf Freigabe warten</option><option value="approved">Nur nach ausdrücklicher Freigabe neu starten</option></select></Field>
    </section>
  </>;

  const renderPreview = () => <>
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Schritt 7</span><h3>Vorschau prüfen</h3></div><PluginHelpPopover title="Vorschau">Die Vorschau zeigt den aktuellen Draft, bevor du den Prompt erzeugst. Änderungen kannst du über die vorherigen Schritte anpassen.</PluginHelpPopover></div>
    <div className="plugin-ai-preview-layout"><div className="plugin-ai-preview-summary"><h3>{draft.name || "Unbenanntes Plugin"}</h3><p>{draft.description || "Noch keine Beschreibung"}</p><dl><div><dt>Inhalt</dt><dd>{draft.pageMode === "blocks" ? "Blöcke und Funktionen" : draft.pageMode === "html" ? "Bereinigtes HTML" : "Sandboxed Iframe"}</dd></div><div><dt>Route</dt><dd>{pluginHostRoute(draft)}</dd></div><div><dt>Flächen</dt><dd>{draft.surfaces.length}</dd></div></dl></div><PluginPreview draft={{ ...draft, creationMode: "ai" }} compact /></div>
  </>;

  const renderPrompt = () => copied ? <div className="plugin-ai-complete" role="status"><div className="plugin-ai-complete-mark"><CheckIcon className="h-5 w-5" /></div><span className="plugins-kicker">Prompt kopiert</span><h3>Prompt ist bereit</h3><p>Gib ihn jetzt an deinen KI-Agenten. Danach findest du den geprüften Draft wieder unter „Eigene Plugins“.</p><button type="button" className="quiet-button-primary" disabled={finishing} onClick={() => void complete()}>Zur Plugin-Übersicht</button>{copyError ? <p className="plugin-ai-error" role="alert">{copyError}</p> : null}</div> : <div className="plugin-prompt-result"><div className="plugin-prompt-result-heading"><div><span className="plugins-kicker">Schritt 8</span><h3>Prompt für deinen KI-Agenten</h3></div><button type="button" className="quiet-button-primary" onClick={() => void copyPrompt()}><CopyIcon className="h-3.5 w-3.5" /> Prompt kopieren</button></div><p>Der Prompt enthält den ausgewählten Draft, die Flächen, Rechte und verbindliche Prüfungen.</p><details><summary>Prompt ansehen</summary><pre>{prompt}</pre></details>{copyError ? <p className="plugin-ai-error" role="alert">{copyError}</p> : null}</div>;

  const renderers = [renderBasics, renderGoal, renderSurfaces, renderDesign, renderCapabilities, renderPermissions, renderPreview, renderPrompt];
  const content = renderers[step]?.() ?? null;

  return <section className="plugin-ai-wizard" aria-labelledby="plugin-ai-title"><header className="plugin-ai-header"><div><span className="plugins-kicker">Wrapt-Plugins</span><h2 id="plugin-ai-title"><SparklesIcon className="h-5 w-5" /> {editMode ? "Plugin mit KI bearbeiten" : "Plugin mit KI vorbereiten"}</h2><p>{editMode ? "Beschreibe die Änderung in einem Satz. Der Skill bewahrt den bestehenden Draft und führt die Prüfung erneut aus." : "Ein grober Satz genügt. Danach kopierst du den vollständigen Auftrag für deinen Coding-Agenten."}</p></div><button type="button" className="icon-button" aria-label="Setup schließen" onClick={() => copied ? void complete() : onClose()}><CloseIcon className="h-4 w-4" /></button></header>{copied ? <div className="plugin-ai-content">{content}</div> : <><nav className="plugin-ai-steps" aria-label="KI-Setup Schritte">{steps.map((item, index) => <button type="button" aria-label={item} aria-current={step === index ? "step" : undefined} className={`${step === index ? "is-active" : ""} ${step > index ? "is-done" : ""}`} key={item} onClick={() => setStep(index)}><span>{index + 1}</span>{item}</button>)}</nav><div className="plugin-ai-content">{content}</div><footer className="plugin-ai-footer"><button type="button" className="quiet-button" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step > 0 ? "Zurück" : "Setup schließen"}</button>{step < steps.length - 1 ? <button type="button" className="quiet-button-primary" onClick={() => setStep(step + 1)}>Weiter</button> : null}</footer></>}</section>;
}
