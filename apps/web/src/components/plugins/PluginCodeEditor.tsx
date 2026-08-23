import { useState } from "react";
import type { PluginDraftContent, PluginPackageFile } from "@wrapt/contracts";
import { CodeFileIcon, PlusIcon, TrashIcon } from "../icons";
import { PluginHelpPopover } from "./PluginHelpPopover";

interface PluginCodeEditorProps {
  draft: PluginDraftContent;
  onChange: (patch: Partial<PluginDraftContent>) => void;
}

export function PluginCodeEditor({ draft, onChange }: PluginCodeEditorProps) {
  const files = draft.packageFiles.length > 0 ? draft.packageFiles : [{ path: "extension.json", content: "{}\n" }];
  const [activeIndex, setActiveIndex] = useState(0);
  const [newFilePath, setNewFilePath] = useState("");
  const safeIndex = Math.min(activeIndex, files.length - 1);
  const activeFile = files[safeIndex]!;

  const updateFile = (patch: Partial<PluginPackageFile>) => onChange({ packageFiles: files.map((file, index) => index === safeIndex ? { ...file, ...patch } : file) });
  const addFile = () => {
    const path = newFilePath.trim();
    if (!path || files.some((file) => file.path === path)) return;
    onChange({ packageFiles: [...files, { path, content: "" }] });
    setActiveIndex(files.length);
    setNewFilePath("");
  };
  const deleteFile = () => {
    if (activeFile.path === "extension.json") return;
    const nextFiles = files.filter((_, index) => index !== safeIndex);
    onChange({ packageFiles: nextFiles });
    setActiveIndex(Math.max(0, safeIndex - 1));
  };

  return <section className="plugin-maker-panel plugin-maker-panel-wide" aria-labelledby="plugin-code-title">
    <div className="plugin-panel-heading"><div><span className="plugins-kicker">Code-Modus</span><h2 id="plugin-code-title">Lokales Extension-Paket</h2></div><PluginHelpPopover title="Code-Modus">Das Paket bleibt lokal. Das Manifest wird aus deinen Maker-Einstellungen erzeugt. Zusätzliche Dateien werden beim Aktivieren geprüft und mit gespeichert.</PluginHelpPopover></div>
    <div className="plugin-code-layout"><nav className="plugin-file-list" aria-label="Plugin-Dateien">{files.map((file, index) => <button type="button" className={`plugin-file-item ${index === safeIndex ? "is-active" : ""}`} key={file.path} onClick={() => setActiveIndex(index)} aria-pressed={index === safeIndex}><CodeFileIcon className="h-4 w-4" /><span>{file.path}</span></button>)}<div className="plugin-file-add"><input value={newFilePath} onChange={(event) => setNewFilePath(event.target.value)} placeholder="datei.json" aria-label="Neue Plugin-Datei" /><button type="button" className="quiet-button" onClick={addFile}><PlusIcon className="h-3.5 w-3.5" /> Datei</button></div><button type="button" className="quiet-button" disabled={activeFile.path === "extension.json"} onClick={deleteFile}><TrashIcon className="h-3.5 w-3.5" /> Datei löschen</button><small>extension.json wird aus dem Formular generiert. Eigene Dateien bleiben lokal.</small></nav><label className="plugin-code-field"><span>{activeFile.path}</span><textarea className="plugin-code-editor" value={activeFile.content} onChange={(event) => updateFile({ content: event.target.value })} spellCheck={false} aria-label={`Inhalt ${activeFile.path}`} /></label></div>
  </section>;
}
