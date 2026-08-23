import DOMPurify from "dompurify";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { PluginDraftContent, PluginFunction, PluginSurface } from "@wrapt/contracts";
import { CloseIcon, CopyIcon, ExternalLinkIcon } from "../icons";
import { PluginSurfacePreview } from "./PluginSurfacePreview";
import { pluginHostRoute } from "./pluginSurfaceState";

function safeIframeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function timerSeconds(value: string): number {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0]! * 60 + parts[1]!);
  return Math.max(0, Math.floor(Number(value)) || 0);
}

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pluginStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function PluginPreview({ draft, compact = false }: { draft: PluginDraftContent; compact?: boolean }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [checkedBlocks, setCheckedBlocks] = useState<Record<string, boolean>>({});
  const [focused, setFocused] = useState(false);
  const [activeSurface, setActiveSurface] = useState<PluginSurface | null>(null);
  const timerBlocks = useMemo(() => draft.blocks.filter((block) => block.type === "timer"), [draft.blocks]);
  const timerBlockSignature = timerBlocks.map((block) => `${block.id}:${block.content}`).join("|");
  const [timerRemaining, setTimerRemaining] = useState<Record<string, number>>(() => Object.fromEntries(timerBlocks.map((block) => [block.id, timerSeconds(block.content)])));
  const [runningTimers, setRunningTimers] = useState<Record<string, boolean>>({});
  const functionById = new Map(draft.functions.map((item) => [item.id, item]));
  const hostRoute = pluginHostRoute(draft);

  useEffect(() => {
    setInputValues({});
    setCheckedBlocks({});
  }, [draft.slug]);

  useEffect(() => {
    setTimerRemaining((current) => {
      const next = { ...current };
      for (const block of timerBlocks) if (next[block.id] === undefined) next[block.id] = timerSeconds(block.content);
      return next;
    });
  }, [timerBlockSignature, timerBlocks]);

  useEffect(() => {
    if (!Object.values(runningTimers).some(Boolean)) return undefined;
    const interval = window.setInterval(() => {
      const completed: string[] = [];
      setTimerRemaining((current) => {
        const next = { ...current };
        for (const block of timerBlocks) {
          if (!runningTimers[block.id]) continue;
          next[block.id] = Math.max(0, (current[block.id] ?? timerSeconds(block.content)) - 1);
          if (next[block.id] === 0) completed.push(block.id);
        }
        return next;
      });
      if (completed.length > 0) setRunningTimers((current) => ({ ...current, ...Object.fromEntries(completed.map((id) => [id, false])) }));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [runningTimers, timerBlockSignature, timerBlocks]);

  const runFunction = async (item: PluginFunction, targetTimerId?: string) => {
    if (item.action === "open-route") {
      if (item.value.startsWith("/")) {
        navigate(item.value);
      } else {
        try {
          const target = new URL(item.value);
          if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Ungültiges Protokoll");
          window.open(target.toString(), "_blank", "noopener,noreferrer");
        } catch {
          setMessage("Ungültige externe URL.");
        }
      }
    }
    if (item.action === "copy-text") {
      await navigator.clipboard?.writeText(item.value);
      setMessage("Text wurde kopiert.");
    }
    if (item.action === "toggle-panel") {
      setToggled((current) => ({ ...current, [item.value]: !current[item.value] }));
      setMessage("Ansicht aktualisiert.");
    }
    if (item.action === "notify") setMessage(item.value || "Aktion ausgeführt.");
    if (item.action === "open-overlay") {
      if (draft.surfaces.includes("overlay")) setActiveSurface("overlay");
      else setMessage("Für dieses Plugin ist kein Overlay deklariert.");
    }
    if (item.action === "open-bottom-sheet") {
      if (draft.surfaces.includes("bottom-sheet")) setActiveSurface("bottom-sheet");
      else setMessage("Für dieses Plugin ist kein Bottom Sheet deklariert.");
    }
    if (item.action === "set-filter") setMessage(`Filter gesetzt: ${item.value || "Standard"}.`);
    if (item.action === "save-state") setMessage("Lokaler Plugin-Zustand gespeichert.");
    if (item.action === "load-state") setMessage("Lokaler Plugin-Zustand geladen.");
    if (item.action === "run-command") setMessage(`Command vorbereitet: ${item.value || "ohne Namen"}.`);
    if (item.action === "refresh-data") setMessage("Plugin-Daten werden aktualisiert.");
    if (item.action === "save-state") {
      try {
        const storage = pluginStorage();
        if (!storage) throw new Error("Storage nicht verfügbar");
        const key = `wrapt.plugin.${draft.slug}.${item.value || "state"}`;
        storage.setItem(key, JSON.stringify({ inputValues, checkedBlocks }));
        setMessage("Plugin-Zustand lokal gespeichert.");
      } catch {
        setMessage("Der lokale Plugin-Zustand konnte nicht gespeichert werden.");
      }
    }
    if (item.action === "load-state") {
      try {
        const storage = pluginStorage();
        if (!storage) throw new Error("Storage nicht verfügbar");
        const key = `wrapt.plugin.${draft.slug}.${item.value || "state"}`;
        const stored = storage.getItem(key);
        const parsed: unknown = stored ? JSON.parse(stored) : null;
        if (isRecord(parsed)) {
          if (isRecord(parsed.inputValues)) setInputValues(Object.fromEntries(Object.entries(parsed.inputValues).filter(([, value]) => typeof value === "string")) as Record<string, string>);
          if (isRecord(parsed.checkedBlocks)) setCheckedBlocks(Object.fromEntries(Object.entries(parsed.checkedBlocks).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>);
          setMessage("Lokaler Plugin-Zustand geladen.");
        } else {
          setMessage("Noch kein lokaler Plugin-Zustand gespeichert.");
        }
      } catch {
        setMessage("Der lokale Plugin-Zustand konnte nicht geladen werden.");
      }
    }
    if (["start-timer", "stop-timer", "reset-timer"].includes(item.action)) {
      const target = targetTimerId ?? timerBlocks[0]?.id;
      const block = timerBlocks.find((candidate) => candidate.id === target);
      if (!target || !block) {
        setMessage("Für diese Aktion ist kein Timer deklariert.");
      } else if (item.action === "start-timer") {
        setTimerRemaining((current) => ({ ...current, [target]: current[target] && current[target] > 0 ? current[target] : timerSeconds(item.value) || timerSeconds(block.content) }));
        setRunningTimers((current) => ({ ...current, [target]: true }));
        setMessage(`${block.title} läuft.`);
      } else if (item.action === "stop-timer") {
        setRunningTimers((current) => ({ ...current, [target]: false }));
        setMessage(`${block.title} pausiert.`);
      } else {
        setRunningTimers((current) => ({ ...current, [target]: false }));
        setTimerRemaining((current) => ({ ...current, [target]: timerSeconds(block.content) }));
        setMessage(`${block.title} zurückgesetzt.`);
      }
    }
  };

  const renderBlock = (block: PluginDraftContent["blocks"][number]) => {
    const action = block.actionId ? functionById.get(block.actionId) : undefined;
    if (block.type === "divider") return <hr key={block.id} className="plugin-preview-divider" />;
    if (block.type === "heading") return <header key={block.id} className="plugin-preview-heading"><span>Plugin-Inhalt</span><h2>{block.title}</h2><p>{block.content}</p></header>;
    if (block.type === "stat") return <div key={block.id} className="plugin-preview-stat"><strong>{block.title}</strong><span>{block.content}</span></div>;
    if (block.type === "timer") return <section key={block.id} className="plugin-preview-block plugin-preview-timer"><h3>{block.title}</h3><strong role="timer" aria-label={`${block.title} verbleibende Zeit`}>{formatTimer(timerRemaining[block.id] ?? timerSeconds(block.content))}</strong><small>{runningTimers[block.id] ? "Läuft" : (timerRemaining[block.id] ?? timerSeconds(block.content)) === 0 ? "Abgelaufen" : "Bereit"}</small>{action ? <button type="button" className="quiet-button-primary" onClick={() => void runFunction(action, block.id)}>{action.label}</button> : null}</section>;
    if (block.type === "list") return <section key={block.id} className="plugin-preview-block"><h3>{block.title}</h3><ul>{lines(block.content).map((item) => <li key={item}>{item}</li>)}</ul></section>;
    if (block.type === "button") { const marked = action?.action === "toggle-panel" && Boolean(toggled[action.value]); return <button key={block.id} type="button" className="quiet-button-primary" disabled={!action} onClick={() => action && void runFunction(action)}>{marked ? "Schritt markiert" : block.title}</button>; }
    if (block.type === "input") return <label key={block.id} className="plugin-preview-input"><span>{block.title}</span><input value={inputValues[block.id] ?? ""} onChange={(event) => setInputValues((current) => ({ ...current, [block.id]: event.target.value }))} placeholder={block.content} /></label>;
    if (block.type === "select") return <label key={block.id} className="plugin-preview-input"><span>{block.title}</span><select defaultValue=""><option value="">{block.content || "Auswählen"}</option><option value="one">Option 1</option><option value="two">Option 2</option></select></label>;
    if (block.type === "checkbox") return <label key={block.id} className="plugin-preview-checkbox"><input type="checkbox" checked={Boolean(checkedBlocks[block.id])} onChange={(event) => setCheckedBlocks((current) => ({ ...current, [block.id]: event.target.checked }))} /> <span>{block.title}</span></label>;
    if (block.type === "progress") return <section key={block.id} className="plugin-preview-block"><h3>{block.title}</h3><progress value={Number(block.content) || 0} max="100" /><small>{block.content || "0"}%</small></section>;
    if (block.type === "notice") return <aside key={block.id} className="plugin-preview-notice"><strong>{block.title}</strong><span>{block.content}</span></aside>;
    if (block.type === "filter") return <section key={block.id} className="plugin-preview-filter"><input placeholder={block.content || "Filtern"} /><button type="button" className="quiet-button" onClick={() => action && void runFunction(action)}>Anwenden</button></section>;
    return <section key={block.id} className={`plugin-preview-block ${toggled[block.id] ? "is-toggled" : ""}`}><h3>{block.title}</h3><p>{block.content || "Freier Inhaltsblock"}</p>{action ? <button type="button" className="quiet-button" onClick={() => void runFunction(action)}>{action.label}</button> : null}</section>;
  };

  const iframeUrl = safeIframeUrl(draft.iframeUrl);
  const preview = (
    <section className={`plugin-preview-shell ${focused ? "is-focused" : ""}`}>
      <section className={`plugin-preview ${compact ? "is-compact" : ""}`} aria-label="Plugin-Vorschau">
      <header className="plugin-preview-bar"><div><span>Live-Vorschau</span><strong>{draft.name}</strong></div><div className="plugin-preview-bar-actions"><code>{hostRoute}</code><button type="button" className="quiet-button" onClick={() => setFocused((value) => !value)}>{focused ? "Vorschau schließen" : "Vorschau öffnen"}</button></div></header>
      <PluginSurfacePreview draft={draft} activeSurface={activeSurface} onOpen={setActiveSurface} onClose={() => setActiveSurface(null)} />
      {draft.pageMode === "iframe" ? (
        iframeUrl ? <div className="plugin-preview-iframe-wrap"><iframe title={`${draft.name} Vorschau`} src={iframeUrl} sandbox="allow-forms allow-modals allow-popups allow-scripts" referrerPolicy="no-referrer" /><small><ExternalLinkIcon className="h-3 w-3" /> Externe Quelle, sandboxed</small></div> : <div className="plugin-preview-empty">Gib eine gültige HTTP- oder HTTPS-URL ein.</div>
      ) : draft.pageMode === "html" ? (
        <div className="plugin-preview-html" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.html) }} />
      ) : (
        <div className="plugin-preview-blocks">{draft.blocks.length > 0 ? draft.blocks.map(renderBlock) : <div className="plugin-preview-empty">Noch keine Inhaltsblöcke.</div>}</div>
      )}
      {message ? <div className="plugin-preview-message" role="status"><span>{message}</span><button type="button" className="icon-button" onClick={() => setMessage(null)} aria-label="Hinweis schließen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
      {draft.functions.length > 0 && draft.pageMode !== "blocks" ? <footer className="plugin-preview-functions">{draft.functions.map((item) => <button type="button" className="quiet-button" key={item.id} onClick={() => void runFunction(item)}><CopyIcon className="h-3.5 w-3.5" />{item.label}</button>)}</footer> : null}
      </section>
    </section>
  );
  return focused ? createPortal(preview, document.body) : preview;
}
