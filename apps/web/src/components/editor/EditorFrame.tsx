import { useEffect, useMemo, useRef, useState } from "react";
import { editorTiming } from "../../config/editor";
import { editorStartupUrl, useEditorRuntime } from "./runtime";
import "./editor-frame.css";

export function EditorFrame({ source, folder }: { source: string; folder: string }) {
  const ready = useEditorRuntime((state) => state.ready[folder]);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hadReady, setHadReady] = useState(Boolean(ready));
  const startup = useMemo(() => editorStartupUrl(source, folder), [source, folder]);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (ready) setHadReady(true); }, [ready]);

  useEffect(() => {
    setLoaded(false); setSlow(false); setFailed(false);
  }, [source, folder, attempt]);

  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setFailed(true), editorTiming.documentTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [loaded, source, attempt]);

  useEffect(() => {
    if (!loaded || ready) return;
    const timer = window.setTimeout(() => setSlow(true), editorTiming.runtimeGraceMs);
    return () => window.clearTimeout(timer);
  }, [loaded, ready, source, attempt]);

  const interrupted = hadReady && ready !== true;
  const retry = () => setAttempt((value) => value + 1);
  return <div className="editor-frame">
    <iframe key={`${source}:${attempt}`} ref={frame} src={startup} title="Editor"
      className="editor-frame-document" allow="clipboard-read 'self'; clipboard-write 'self'"
      referrerPolicy="same-origin" allowFullScreen
      onLoad={() => {
        const type = frame.current?.contentDocument?.contentType;
        const errorDocument = type === "application/json" || type === "text/plain";
        setLoaded(!errorDocument); setFailed(errorDocument);
      }}
      onError={() => setFailed(true)} />
    {!loaded && !failed ? <div className="editor-frame-loading" role="status" aria-label="Editor wird geladen">
      <div className="editor-frame-skeleton" aria-hidden="true"><i /><i /><i /></div>
      <span>Editor wird geladen…</span>
    </div> : null}
    {failed ? <div className="editor-frame-failure" role="alert">
      <p>Der Editor konnte nicht geladen werden.</p>
      <div><button type="button" className="quiet-button-primary" onClick={retry}>Erneut versuchen</button>
        <a className="quiet-button" href={source} target="_blank" rel="noopener noreferrer">Separat öffnen</a></div>
    </div> : null}
    {loaded && !failed && ready !== true ? <div className="editor-frame-notice" role="status">
      <span>{interrupted ? "Die Wrapt-Verbindung ist unterbrochen. Wiederverbindung läuft; deine Eingaben bleiben im Editor."
        : slow ? "Wrapt-Integration nicht verbunden. Der Editor bleibt bedienbar. Hilfe: GitHub und Sync im Werkzeugmenü."
          : "Dateiöffnen wird verbunden…"}</span>
    </div> : null}
  </div>;
}
