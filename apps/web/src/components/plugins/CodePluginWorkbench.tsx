import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExtensionRegistryDetail, LocalPluginSource, LocalPluginState } from "@wrapt/extension-contracts";
import { pluginRequest } from "../../extensions/code-client";
import { ConfirmDialog } from "../ModalDialog";
import { queryPollingInterval } from "../../lib/queryPolicy";
import { QueryBoundary } from "../QueryBoundary";
import { registerEditorReloadGuard } from "../../lib/reloadGuard";
import "./code-plugins.css";

type State = LocalPluginState & { runtime: ExtensionRegistryDetail | null };

export function CodePluginWorkbench() {
  const client = useQueryClient();
  const plugins = useQuery({ queryKey: ["plugins", "code"], queryFn: () => pluginRequest<{ plugins: State[] }>("code", undefined, "GET"), refetchInterval: queryPollingInterval(5_000) });
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("Mein Plugin");
  const [id, setId] = useState("personal.mein-plugin");
  const [directory, setDirectory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trust, setTrust] = useState<State | null>(null);
  const [remove, setRemove] = useState<State | null>(null);
  const [inspector, setInspector] = useState<unknown>();
  const [source, setSource] = useState<LocalPluginSource | null>(null);
  const [savedSource, setSavedSource] = useState("");
  const dirty = source !== null && JSON.stringify(source) !== savedSource;
  useEffect(() => {
    const unregister = registerEditorReloadGuard(() => dirty);
    const guard = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => { unregister(); window.removeEventListener("beforeunload", guard); };
  }, [dirty]);
  const [file, setFile] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["plugins"] });
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const edit = async (pluginId: string, saved = false) => {
    if (!saved && dirty && !window.confirm("Ungespeicherte Plugin-Quellen verwerfen?")) return;
    const value = await pluginRequest<LocalPluginSource>(`code/${pluginId}/source`, undefined, "GET");
    setSelected(pluginId); setSource(value); setSavedSource(JSON.stringify(value));
    setFile(pluginId === selected && value.files.some((item) => item.path === file) ? file : value.files[0]?.path ?? "");
  };
  const currentFile = source?.files.find((item) => item.path === file);
  return <section className="code-plugins" aria-label="Lokale Code-Plugins" aria-busy={busy}>
    <header className="plugin-panel-heading"><h2>Lokale Code-Plugins</h2><a className="quiet-button" href="/api/v1/plugins/docs/README.md" target="_blank" rel="noreferrer">SDK-Referenz</a></header>
    <form className="code-plugin-create" onSubmit={(event) => { event.preventDefault(); void run(async () => { const value = await pluginRequest<State>("code/scaffold", { id, name }); await edit(value.id); }); }}>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label>Plugin-ID<input value={id} onChange={(event) => setId(event.target.value)} required /></label>
      <button className="quiet-button-primary" disabled={busy} type="submit">Code-Plugin erstellen</button>
    </form>
    <form className="code-plugin-import" onSubmit={(event) => { event.preventDefault(); void run(() => pluginRequest("code/register", { directory })); }}>
      <label>Vorhandenen lokalen Ordner registrieren<input value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="/home/user/meine-plugins/aufgaben" required /></label>
      <button type="submit" className="quiet-button" disabled={busy}>Registrieren</button>
    </form>
    {error ? <p role="alert" className="code-plugin-error">{error}</p> : null}
    <QueryBoundary isLoading={plugins.isPending} isError={plugins.isError} error={plugins.error} data={plugins.data} refetch={plugins.refetch} loadingLabel="Plugins werden geladen…">{(data) => <>
    {data.plugins.length === 0 ? <p>Noch keine Code-Plugins. Erstelle eines oder registriere deinen lokalen Quellordner.</p> : null}
    <div className="code-plugin-list">{data.plugins.map((plugin) => <article key={plugin.id} className="code-plugin-row">
      <div><h3>{plugin.name}</h3><code>{plugin.id}</code><p>{plugin.runtime?.runtimeActive ? `Aktiv · ${plugin.runtime.activeVersion}` : "Inaktiv"} · Quelle {plugin.sourceRevision} · Build {plugin.builtRevision ?? "fehlt"}</p></div>
      <div className="code-plugin-actions">
        <button className="quiet-button" disabled={busy} onClick={() => { void run(() => edit(plugin.id)); }}>Quellen</button>
        <button className="quiet-button" disabled={busy} onClick={() => { void run(() => pluginRequest(`code/${plugin.id}/build`)); }}>Bauen</button>
        <button className="quiet-button-primary" disabled={busy} onClick={() => plugin.trusted ? void run(() => pluginRequest(`code/${plugin.id}/activate`, { trust: false })) : setTrust(plugin)}>Aktivieren</button>
        {plugin.runtime?.runtimeActive ? <button className="quiet-button" disabled={busy} onClick={() => { void run(() => pluginRequest(`code/${plugin.id}/actions`, { action: "disable" })); }}>Deaktivieren</button> : null}
        {plugin.runtime?.rollbackVersion ? <button className="quiet-button" disabled={busy} onClick={() => { void run(() => pluginRequest(`code/${plugin.id}/actions`, { action: "rollback" })); }}>Zurück auf {plugin.runtime.rollbackVersion}</button> : null}
        <button className="quiet-button" disabled={busy} onClick={() => { void run(async () => setInspector(await pluginRequest(`code/${plugin.id}/inspector`, undefined, "GET"))); }}>Inspektor</button>
        <label className="code-plugin-dev"><input type="checkbox" checked={plugin.development} disabled={busy} onChange={(event) => { void run(() => pluginRequest(`code/${plugin.id}/development`, { enabled: event.target.checked }, "PATCH")); }} />Automatisch neu laden</label>
        <button className="quiet-button" disabled={busy} onClick={() => setRemove(plugin)}>Entfernen</button>
      </div>
      {plugin.diagnostics.length > 0 ? <pre className="code-plugin-diagnostics" role="status">{plugin.diagnostics.map((entry) => `${entry.file}${entry.line ? `:${entry.line}` : ""}: ${entry.message}`).join("\n")}</pre> : null}
    </article>)}</div>
    </>}</QueryBoundary>
    {source && selected ? <section className="code-plugin-editor" aria-label="Plugin-Quellen">
      <header><h3>{source.definition.name}{dirty ? " · Ungespeichert" : ""}</h3><button className="quiet-button" onClick={() => { if (!dirty || window.confirm("Ungespeicherte Plugin-Quellen verwerfen?")) setSource(null); }}>Editor schließen</button></header>
      <label>Datei<select value={file} disabled={busy} onChange={(event) => setFile(event.target.value)}>{source.files.map((item) => <option key={item.path}>{item.path}</option>)}</select></label>
      <textarea aria-label={`Quellcode ${file}`} disabled={busy} spellCheck={false} value={currentFile?.content ?? ""} onChange={(event) => setSource({ ...source, files: source.files.map((item) => item.path === file ? { ...item, content: event.target.value } : item) })} />
      <button className="quiet-button-primary" disabled={busy || !dirty} onClick={() => { void run(async () => { await pluginRequest(`code/${selected}/source`, { definition: source.definition, files: source.files, expectedRevision: source.revision }, "PUT"); await edit(selected, true); }); }}>Quellen speichern</button>
    </section> : null}
    {inspector ? <section className="code-plugin-inspector"><header><h3>Laufzeit-Inspektor</h3><button className="quiet-button" onClick={() => setInspector(undefined)}>Schließen</button></header><pre>{JSON.stringify(inspector, null, 2)}</pre></section> : null}
    <ConfirmDialog open={trust !== null} title="Code-Plugin vertrauen?" description="Servercode hat die Rechte des Wrapt-Systembenutzers und kann Dateien, Netzwerk und Prozesse nutzen. Browsercode hat Zugriff auf deine Wrapt-Oberfläche. Aktiviere nur deinen eigenen oder geprüften Code." confirmLabel="Vertrauen und aktivieren" confirmPending={busy} onClose={() => setTrust(null)} onConfirm={() => { if (trust) { const plugin = trust; setTrust(null); void run(() => pluginRequest(`code/${plugin.id}/activate`, { trust: true })); } }} />
    <ConfirmDialog open={remove !== null} title="Code-Plugin entfernen?" description="Das Plugin wird deaktiviert und die verwaltete Quellkopie entfernt. Externe Quellordner und Laufzeitdaten bleiben erhalten." confirmLabel="Entfernen" danger confirmPending={busy} onClose={() => setRemove(null)} onConfirm={() => { if (remove) { const plugin = remove; setRemove(null); void run(() => pluginRequest(`code/${plugin.id}`, undefined, "DELETE")); } }} />
  </section>;
}
