import type { PluginCapability, PluginDraftContent, PluginSurface, PluginSurfaceContribution } from "@wrapt/contracts";
import { PlusIcon, TrashIcon } from "../icons";
import { PluginHelpPopover } from "./PluginHelpPopover";
import { togglePluginSurface } from "./pluginSurfaceState";

const surfaceOptions: Array<{ value: PluginSurface; label: string; description: string }> = [
  { value: "page", label: "Eigene Seite", description: "Eine vollständige Plugin-Fläche." },
  { value: "sidebar", label: "Werkzeug in der Sidebar", description: "Eine vollständige Seite links in der Navigation öffnen." },
  { value: "topbar", label: "Topbar", description: "Kleine Aktion oder Statusanzeige oben." },
  { value: "bottom-bar", label: "Bottom-Bar", description: "Status, Zähler oder Schnellaktion unten." },
  { value: "dashboard", label: "Dashboard", description: "Karte, Metrik, Liste oder Quick Action." },
  { value: "orbit", label: "Orbit", description: "Node, Inspector oder Orbit-Aktion." },
  { value: "right-rail", label: "Rechte Seitenleiste", description: "Ein kontrolliertes Panel neben dem Inhalt." },
  { value: "overlay", label: "Overlay", description: "Kleine kontextbezogene Zusatzfläche." },
  { value: "bottom-sheet", label: "Bottom Sheet", description: "Mobile Fläche für Aktionen und Details." },
  { value: "context-menu", label: "Kontextmenü", description: "Aktion am aktuellen Host-Kontext." },
  { value: "preview", label: "Preview", description: "Aktion oder Anzeige für eine Preview." },
];

const capabilityKinds: Array<{ value: PluginCapability["kind"]; label: string }> = [
  { value: "content", label: "Inhalt" },
  { value: "action", label: "Aktion" },
  { value: "data", label: "Daten" },
  { value: "agent-tool", label: "Agent-Tool" },
];

interface PluginCapabilityPickerProps {
  draft: PluginDraftContent;
  onChange: (patch: Partial<PluginDraftContent>) => void;
}

export function PluginCapabilityPicker({ draft, onChange }: PluginCapabilityPickerProps) {
  const toggleSurface = (surface: PluginSurface) => {
    onChange(togglePluginSurface(draft, surface));
  };

  const updateCapability = (index: number, patch: Partial<PluginCapability>) => {
    onChange({ capabilities: draft.capabilities.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  const addCapability = () => {
    const index = draft.capabilities.length + 1;
    const capability: PluginCapability = {
      id: `aktion-${index}`,
      label: "Neue Aktion",
      kind: "action",
      surface: draft.surfaces[0] ?? "page",
      description: "Eine kontrollierte Plugin-Aktion.",
      permission: null,
      enabled: true,
    };
    const contribution: PluginSurfaceContribution = {
      id: `surface-${index}`,
      surface: capability.surface,
      title: capability.label,
      description: capability.description,
      mobileBehavior: capability.surface === "right-rail" ? "bottom-sheet" : "same",
      token: "accent",
    };
    onChange({ capabilities: [...draft.capabilities, capability], surfaceContributions: [...draft.surfaceContributions, contribution] });
  };

  return <section className="plugin-maker-panel plugin-maker-panel-wide" aria-labelledby="plugin-surfaces-title">
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Einsatzort</span><h2 id="plugin-surfaces-title">Was soll das Plugin erweitern?</h2></div><PluginHelpPopover title="Host-Oberflächen">Plugins ergänzen kontrollierte Slots. Sie ersetzen keine geschützten Kernbereiche und verwenden auf Mobile eine passende Darstellung.</PluginHelpPopover></div>
    <div className="plugin-surface-grid">{surfaceOptions.map((option) => <label className={`plugin-surface-option ${draft.surfaces.includes(option.value) ? "is-selected" : ""}`} key={option.value}><input type="checkbox" checked={draft.surfaces.includes(option.value)} disabled={option.value === "page"} onChange={() => toggleSurface(option.value)} /><span><strong>{option.label}</strong><small>{option.value === "page" ? "Grundfläche jedes Plugins." : option.description}</small></span></label>)}</div>
    <div className="plugin-capability-heading"><div><strong>Aktionen und Daten</strong><PluginHelpPopover title="Fähigkeiten">Füge nur Aktionen hinzu, die wirklich gebraucht werden. Permissions werden später direkt an der Fähigkeit angezeigt.</PluginHelpPopover></div><button type="button" className="quiet-button" onClick={addCapability}><PlusIcon className="h-3.5 w-3.5" /> Fähigkeit hinzufügen</button></div>
    {draft.capabilities.length > 0 ? <div className="plugin-capability-list">{draft.capabilities.map((capability, index) => <div className="plugin-capability-row" key={capability.id}>
      <input value={capability.label} aria-label={`Fähigkeit ${index + 1}`} onChange={(event) => updateCapability(index, { label: event.target.value })} />
      <select value={capability.kind} aria-label={`Art Fähigkeit ${index + 1}`} onChange={(event) => updateCapability(index, { kind: event.target.value as PluginCapability["kind"] })}>{capabilityKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
      <select value={capability.surface} aria-label={`Oberfläche Fähigkeit ${index + 1}`} onChange={(event) => updateCapability(index, { surface: event.target.value as PluginSurface })}>{surfaceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <input value={capability.permission ?? ""} placeholder="Permission optional" aria-label={`Permission Fähigkeit ${index + 1}`} onChange={(event) => updateCapability(index, { permission: event.target.value || null })} />
      <label className="plugin-capability-toggle"><input type="checkbox" checked={capability.enabled} onChange={(event) => updateCapability(index, { enabled: event.target.checked })} /><span>Aktiv</span></label>
      <button type="button" className="icon-button danger" onClick={() => onChange({ capabilities: draft.capabilities.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Fähigkeit ${index + 1} löschen`}><TrashIcon className="h-4 w-4" /></button>
      <textarea value={capability.description} aria-label={`Beschreibung Fähigkeit ${index + 1}`} onChange={(event) => updateCapability(index, { description: event.target.value })} />
    </div>)}</div> : <p className="plugins-muted">Noch keine zusätzliche Fähigkeit. Eine Plugin-Seite funktioniert auch ohne Aktionen.</p>}
  </section>;
}
