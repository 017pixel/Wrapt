import type { PluginDraftContent, PluginSurface, PluginSurfaceContribution } from "@wrapt/contracts";

const surfaceLabels: Record<PluginSurface, string> = {
  page: "Eigene Seite",
  sidebar: "Sidebar",
  topbar: "Topbar",
  "bottom-bar": "Bottom-Bar",
  dashboard: "Dashboard",
  orbit: "Orbit",
  "right-rail": "Rechte Seitenleiste",
  overlay: "Overlay",
  "bottom-sheet": "Bottom Sheet",
  "context-menu": "Kontextmenü",
  preview: "Preview",
};

const interactiveSurfaces = new Set<PluginSurface>([
  "right-rail",
  "overlay",
  "bottom-sheet",
  "context-menu",
  "preview",
]);

function entriesFor(draft: PluginDraftContent): PluginSurfaceContribution[] {
  const explicit = draft.surfaceContributions.filter((entry) => entry.surface !== "page");
  const selected = draft.surfaces.filter((surface) => surface !== "page");
  const known = new Set(explicit.map((entry) => entry.surface));
  const mobileBehavior: PluginSurfaceContribution["mobileBehavior"] = draft.wizard.mobileBehavior === "bottom-sheet"
    ? "bottom-sheet"
    : draft.wizard.mobileBehavior === "full-screen"
      ? "full-screen"
      : "same";
  return [
    ...explicit,
    ...selected.filter((surface) => !known.has(surface)).map((surface) => ({
      id: `${surface}-main`,
      surface,
      title: draft.name,
      description: draft.description,
      mobileBehavior,
      token: "accent" as const,
    })),
  ];
}

interface PluginSurfacePreviewProps {
  draft: PluginDraftContent;
  activeSurface: PluginSurface | null;
  onOpen: (surface: PluginSurface) => void;
  onClose: () => void;
}

export function PluginSurfacePreview({ draft, activeSurface, onOpen, onClose }: PluginSurfacePreviewProps) {
  const entries = entriesFor(draft);
  const activeEntry = entries.find((entry) => entry.surface === activeSurface);

  return <>
    {entries.length > 0 ? <section className="plugin-surface-preview" aria-label="Preview der Host-Flächen">
      <header className="plugin-surface-preview-heading"><div><span>Host-Flächen</span><strong>So fügt sich das Plugin ein</strong></div><small>{entries.length} Contributions</small></header>
      <div className="plugin-surface-preview-grid">{entries.map((entry) => <article className={`plugin-surface-preview-card is-${entry.surface}`} data-token={entry.token} key={`${entry.surface}-${entry.id}`}><div><span>{surfaceLabels[entry.surface]}</span><strong>{entry.title}</strong></div><p>{entry.description}</p>{interactiveSurfaces.has(entry.surface) ? <button type="button" className="quiet-button" onClick={() => onOpen(entry.surface)} aria-label={`${entry.title} öffnen`}>Öffnen</button> : null}</article>)}</div>
    </section> : null}
    {activeEntry ? <div className={`plugin-surface-dialog is-${activeEntry.surface}`} role="dialog" aria-modal="true" aria-label={activeEntry.title}><div className="plugin-surface-dialog-card" data-token={activeEntry.token}><span>{surfaceLabels[activeEntry.surface]}</span><h3>{activeEntry.title}</h3><p>{activeEntry.description}</p><small>Mobile: {activeEntry.mobileBehavior === "bottom-sheet" ? "Bottom Sheet" : activeEntry.mobileBehavior === "full-screen" ? "Vollbild" : "responsive"}</small><button type="button" className="quiet-button-primary" onClick={onClose} aria-label={`${activeEntry.title} schließen`}>Schließen</button></div></div> : null}
  </>;
}
