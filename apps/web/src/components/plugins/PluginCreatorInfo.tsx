import { useState } from "react";
import type { PluginCreatorSkillResponse } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { ModalFrame } from "../ModalDialog";
import { DownloadIcon, ExtensionsIcon, EyeIcon, LoaderIcon } from "../icons";
import "./pluginOverview.css";

function downloadSkill(file: PluginCreatorSkillResponse) {
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "plugin-creator-SKILL.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PluginCreatorInfo() {
  const [open, setOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [file, setFile] = useState<PluginCreatorSkillResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function openInfo() {
    setOpen(true);
    if (file || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.pluginCreatorSkill();
      if (!response) throw new Error("Die Skill-Datei ist leer.");
      setFile(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Plugin-Creator-Skill konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <aside className="plugins-skill-note" aria-label="Plugin Creator Skill">
      <ExtensionsIcon className="h-4 w-4" />
      <span><strong>Plugin Creator</strong> nutzt mit deinem Coding-Agenten denselben geprüften Draft-, Validierungs- und Aktivierungsflow.</span>
      <code>$plugin-creator</code>
      <button type="button" className="quiet-button" onClick={() => void openInfo()}>Mehr erfahren</button>
    </aside>
    <ModalFrame open={open} title="Plugin Creator" description="Der geführte Skill für persönliche Wrapt-Plugins" className="plugin-creator-dialog" onClose={() => setOpen(false)}>{(requestClose) => <>
      <div className="modal-content plugin-creator-content">
        <section><span className="plugins-kicker">Verwendung</span><h3>Mit dem Skill starten</h3><p>Schreibe deinem Coding-Agenten <code>$plugin-creator</code> und beschreibe das gewünschte Plugin. Im Wrapt-Repository wählt der Skill automatisch den deklarativen Plugin-Flow.</p></section>
        <ol><li>Anforderungen, Flächen und Berechtigungen festlegen.</li><li>Einen persönlichen Draft erstellen oder gezielt bearbeiten.</li><li>Validieren, materialisiertes Paket prüfen und erst danach aktivieren.</li></ol>
        <div className="plugin-creator-command"><code>$plugin-creator Erstelle ein Plugin für …</code></div>
        {loading ? <p className="plugin-creator-file-state" role="status"><LoaderIcon className="h-3.5 w-3.5 animate-spin" /> Skill-Datei wird geladen.</p> : null}
        {error ? <p className="plugin-creator-file-error" role="alert">{error}</p> : null}
        <div className="plugin-creator-file-actions">
          <button type="button" className="quiet-button" disabled={!file} onClick={() => setSourceOpen((value) => !value)}><EyeIcon className="h-3.5 w-3.5" /> {sourceOpen ? "Skill ausblenden" : "Skill ansehen"}</button>
          <button type="button" className="quiet-button" disabled={!file} onClick={() => file && downloadSkill(file)}><DownloadIcon className="h-3.5 w-3.5" /> SKILL.md herunterladen</button>
        </div>
        {sourceOpen && file ? <pre className="plugin-creator-source">{file.content}</pre> : null}
      </div>
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={requestClose}>Schließen</button></div>
    </>}</ModalFrame>
  </>;
}
