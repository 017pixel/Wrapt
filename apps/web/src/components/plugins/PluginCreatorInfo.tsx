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
  anchor.download = "wrapt-plugins-SKILL.md";
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
      const response = await apiClient.wraptPluginsSkill();
      if (!response) throw new Error("Die Skill-Datei ist leer.");
      setFile(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Wrapt-Plugins-Skill konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <aside className="plugins-skill-note" aria-label="Wrapt-Plugins Skill">
      <ExtensionsIcon className="h-4 w-4" />
      <span><strong>Wrapt-Plugins</strong> erstellt und verwaltet mit deinem Coding-Agenten persönliche Plugins lokal, ohne Repository- oder Store-Dateien zu verändern.</span>
      <code>$wrapt-plugins</code>
      <button type="button" className="quiet-button" onClick={() => void openInfo()}>Mehr erfahren</button>
    </aside>
    <ModalFrame open={open} title="Wrapt-Plugins" description="Der geprüfte Skill für persönliche Plugins" className="plugin-creator-dialog" onClose={() => setOpen(false)}>{(requestClose) => <>
      <div className="modal-content plugin-creator-content">
        <section><span className="plugins-kicker">Verwendung</span><h3>Mit dem Skill starten</h3><p>Schreibe deinem Coding-Agenten <code>$wrapt-plugins</code> und beschreibe dein Ziel in einem Satz. Der Skill erstellt oder bearbeitet den persönlichen Draft, prüft ihn und aktiviert ihn erst nach erfolgreicher Validierung.</p></section>
        <ol><li>Ein persönliches Plugin aus einer groben Idee erstellen.</li><li>Ein vorhandenes Plugin gezielt weiterentwickeln.</li><li>Validieren, aktivieren, deaktivieren oder nach Bestätigung löschen.</li></ol>
        <div className="plugin-creator-command"><code>$wrapt-plugins Erstelle ein Plugin für ...</code></div>
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
