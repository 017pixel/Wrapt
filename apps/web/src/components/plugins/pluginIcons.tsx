import type { ComponentType } from "react";
import type { PluginIconName } from "@wrapt/contracts";
import {
  BookmarkIcon,
  BrowserIcon,
  CheckIcon,
  ClockIcon,
  CodeServerIcon,
  DatabaseIcon,
  DashboardIcon,
  ExtensionsIcon,
  FileIcon,
  FinderIcon,
  FolderIcon,
  LayoutPanelIcon,
  LinkIcon,
  ListIcon,
  NoteIcon,
  NutzungIcon,
  EditIcon,
  PlayIcon,
  RocketIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  WarningIcon,
} from "../icons";

type IconComponent = ComponentType<{ className?: string }>;

export interface PluginIconPreset {
  readonly name: PluginIconName;
  readonly label: string;
  readonly Icon: IconComponent;
}

export const pluginIconPresets: readonly PluginIconPreset[] = [
  { name: "extensions", label: "Erweiterungen", Icon: ExtensionsIcon },
  { name: "dashboard", label: "Dashboard", Icon: DashboardIcon },
  { name: "terminal", label: "Terminal", Icon: TerminalIcon },
  { name: "code", label: "Code", Icon: CodeServerIcon },
  { name: "browser", label: "Browser", Icon: BrowserIcon },
  { name: "chart", label: "Diagramm", Icon: NutzungIcon },
  { name: "clock", label: "Uhr", Icon: ClockIcon },
  { name: "check-circle", label: "Erledigt", Icon: CheckIcon },
  { name: "checklist", label: "Checkliste", Icon: ListIcon },
  { name: "note", label: "Notiz", Icon: NoteIcon },
  { name: "link", label: "Link", Icon: LinkIcon },
  { name: "calendar", label: "Kalender", Icon: BookmarkIcon },
  { name: "search", label: "Suche", Icon: FinderIcon },
  { name: "folder", label: "Ordner", Icon: FolderIcon },
  { name: "file", label: "Datei", Icon: FileIcon },
  { name: "bell", label: "Hinweis", Icon: WarningIcon },
  { name: "shield", label: "Sicherheit", Icon: ShieldIcon },
  { name: "database", label: "Datenbank", Icon: DatabaseIcon },
  { name: "rocket", label: "Start", Icon: RocketIcon },
  { name: "pencil", label: "Bearbeiten", Icon: EditIcon },
  { name: "play", label: "Starten", Icon: PlayIcon },
  { name: "layout", label: "Layout", Icon: LayoutPanelIcon },
  { name: "globe", label: "Globus", Icon: BrowserIcon },
  { name: "list", label: "Liste", Icon: ListIcon },
  { name: "sparkles", label: "Funken", Icon: SparklesIcon },
];

const iconByName = new Map(pluginIconPresets.map((preset) => [preset.name, preset.Icon]));

export function resolvePluginIcon(name: string | undefined): IconComponent {
  return iconByName.get(name as PluginIconName) ?? ExtensionsIcon;
}

export function PluginIcon({ name, className }: { name: string | undefined; className?: string }) {
  const Icon = resolvePluginIcon(name);
  return className ? <Icon className={className} /> : <Icon />;
}

export function PluginIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="plugin-icon-picker" aria-labelledby="plugin-icon-picker-title">
      <div className="plugin-panel-heading">
        <div>
          <span className="plugins-kicker">Icon</span>
          <h2 id="plugin-icon-picker-title">Plugin-Icon auswählen</h2>
        </div>
        <small>25 Vorgaben oder ein registriertes Icon-Codewort.</small>
      </div>
      <div className="plugin-icon-grid">
        {pluginIconPresets.map(({ name, label, Icon }) => (
          <label className={`plugin-icon-option ${value === name ? "is-selected" : ""}`} key={name}>
            <input
              type="radio"
              name="plugin-icon"
              value={name}
              checked={value === name}
              onChange={() => onChange(name)}
              aria-label={label}
            />
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <label className="plugin-icon-custom">
        <span className="plugin-field-label">Eigenes Icon-Codewort</span>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="z. B. clock" aria-label="Eigenes Icon-Codewort" />
        <small>Im Code kann hier ein weiteres Codewort stehen. Wenn Wrapt es nicht kennt, wird sicher das Standard-Icon verwendet.</small>
      </label>
    </section>
  );
}
