import { useEffect } from "react";
import type { PluginCreationMode } from "@wrapt/contracts";
import { CloseIcon, CodeFileIcon, ExtensionsIcon, SparklesIcon } from "../icons";

type CreationMode = PluginCreationMode;

interface PluginCreationChooserProps {
  open: boolean;
  purpose?: "create" | "edit";
  pluginName?: string;
  onClose: () => void;
  onSelect: (mode: CreationMode) => void;
}

const modes: Array<{
  mode: CreationMode;
  title: string;
  description: string;
  icon: typeof SparklesIcon;
  recommended?: boolean;
}> = [
  {
    mode: "ai",
    title: "Mit KI erstellen",
    description: "Ein grober Satz genügt. Der Skill erstellt daraus einen vollständigen persönlichen Draft.",
    icon: SparklesIcon,
    recommended: true,
  },
  {
    mode: "visual",
    title: "Visuell erstellen",
    description: "Baue Seiten, Panels, Aktionen und Contributions mit Bausteinen zusammen.",
    icon: ExtensionsIcon,
  },
  {
    mode: "code",
    title: "Mit Code erstellen",
    description: "Definiere dein persönliches Plugin direkt mit dem lokalen Draft-Editor.",
    icon: CodeFileIcon,
  },
];

export function PluginCreationChooser({ open, purpose = "create", pluginName, onClose, onSelect }: PluginCreationChooserProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  const editing = purpose === "edit";

  return <div className="plugin-chooser-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="plugin-chooser" role="dialog" aria-modal="true" aria-labelledby="plugin-chooser-title">
      <header className="plugin-chooser-heading">
        <div>
          <span className="plugins-kicker">{editing ? "Plugin bearbeiten" : "Lokaler Draft"}</span>
          <h2 id="plugin-chooser-title">{editing ? "Plugin bearbeiten" : "Neues Plugin erstellen"}</h2>
          <p>{pluginName ? `„${pluginName}“ · ` : ""}Wähle den Weg, der zu deiner Arbeitsweise passt.</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen"><CloseIcon className="h-4 w-4" /></button>
      </header>
      <div className="plugin-chooser-options">
        {modes.map(({ mode, title, description, icon: Icon }) => {
          const recommended = editing ? mode === "visual" : mode === "ai";
          const actionTitle = editing ? title.replace("erstellen", "bearbeiten") : title;
          return <button type="button" className={`plugin-chooser-option ${recommended ? "is-recommended" : ""}`} key={mode} onClick={() => onSelect(mode)}>
          <span className="plugin-chooser-option-icon"><Icon className="h-5 w-5" /></span>
          <span className="plugin-chooser-option-copy"><strong>{actionTitle}</strong>{recommended ? <small>Empfohlen</small> : null}<span>{editing ? description.replace("erstellen", "bearbeiten") : description}</span></span>
        </button>;
        })}
      </div>
      <footer className="plugin-chooser-footer"><button type="button" className="quiet-button" onClick={onClose}>Abbrechen</button></footer>
    </section>
  </div>;
}
