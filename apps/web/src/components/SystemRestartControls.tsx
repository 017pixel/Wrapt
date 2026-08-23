import { useEffect, useRef, useState } from "react";
import type { RestartTarget } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../lib/apiClient";
import { writeClipboardText } from "../lib/clipboard";
import { CopyIcon, DeviceRotateIcon, LoaderIcon, RefreshIcon, ServerIcon, WarningIcon } from "./icons";

const restartButtons: { target: RestartTarget; label: string; hint: string; icon: typeof ServerIcon }[] = [
  { target: "frontend", label: "Frontend", hint: "Nur die Oberfläche neu bauen", icon: DeviceRotateIcon },
  { target: "backend", label: "Backend", hint: "Server neu bauen & neu starten", icon: ServerIcon },
  { target: "both", label: "Beides", hint: "Frontend & Backend zusammen", icon: RefreshIcon },
];

const restartWorkingLabel: Record<RestartTarget, string> = {
  frontend: "Frontend wird neu gebaut …",
  backend: "Backend wird neu gebaut und neu gestartet …",
  both: "Frontend und Backend werden neu gebaut …",
};

export type RestartUiPhase =
  | { status: "idle" }
  | { status: "working"; target: RestartTarget; step: string }
  | { status: "error"; target: RestartTarget; message: string; logTail: string };

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const RESTART_DEADLINE_MS = 300_000;

export function useSystemRestart() {
  const [phase, setPhase] = useState<RestartUiPhase>({ status: "idle" });
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  async function waitForResult(target: RestartTarget, baseline: { bootId: string; webBuildId: number | null }) {
    const deadline = Date.now() + RESTART_DEADLINE_MS;
    let lastLogTail = "";
    let scriptFinished = false;
    while (Date.now() < deadline) {
      await sleep(1_500);
      if (cancelledRef.current) return { ok: true } as const;
      try {
        const status = await apiClient.restartStatus();
        if (!status) continue;
        lastLogTail = status.logTail || lastLogTail;
        if (status.phase === "failed") {
          return { ok: false, message: status.message || "Der Neustart ist fehlgeschlagen.", logTail: status.logTail } as const;
        }
        if (status.phase === "running" && status.step) setPhase({ status: "working", target, step: status.step });
        scriptFinished = status.phase === "succeeded";
        const backendRestarted = status.bootId !== baseline.bootId;
        const frontendRebuilt = status.webBuildId !== null && status.webBuildId !== baseline.webBuildId;
        if (scriptFinished && (target === "frontend" ? frontendRebuilt : backendRestarted)) return { ok: true } as const;
      } catch {
        // Während des Backend-Neustarts ist der Server kurz nicht erreichbar.
      }
    }
    return {
      ok: false,
      message: scriptFinished
        ? "Der Build lief durch, aber der Dienst meldet sich nicht zurück. Prüfe: systemctl --user status wrapt.service"
        : "Zeitüberschreitung, der Neustart hat zu lange gebraucht.",
      logTail: lastLogTail,
    } as const;
  }

  async function restart(target: RestartTarget) {
    cancelledRef.current = false;
    setPhase({ status: "working", target, step: "Neustart wird angestoßen …" });
    try {
      const response = await apiClient.restartSystem(target);
      if (!response) throw new Error("Keine Antwort vom Server erhalten.");
      const result = await waitForResult(target, { bootId: response.bootId, webBuildId: response.webBuildId });
      if (cancelledRef.current) return;
      if (result.ok) {
        window.location.reload();
        return;
      }
      setPhase({ status: "error", target, message: result.message, logTail: result.logTail });
    } catch (error) {
      if (cancelledRef.current) return;
      const message = error instanceof ApiClientError ? error.message : "Der Neustart konnte nicht ausgelöst werden.";
      const status = await apiClient.restartStatus().catch(() => null);
      setPhase({ status: "error", target, message, logTail: status?.logTail ?? "" });
    }
  }

  return { phase, restart };
}

export function RestartProgress({ phase }: { phase: Exclude<RestartUiPhase, { status: "idle" }> }) {
  if (phase.status === "working") {
    return <div className="space-y-1" role="status"><span className="flex items-center gap-2 text-[12px] text-muted"><LoaderIcon className="h-3.5 w-3.5 shrink-0 animate-spin" /> {restartWorkingLabel[phase.target]} Die Seite lädt danach automatisch neu.</span><small className="block pl-[22px] text-[11px] text-faint">{phase.step}</small></div>;
  }
  return <p className="flex items-start gap-2 text-[12px] text-bad" role="alert"><WarningIcon className="h-3.5 w-3.5 shrink-0" /> <span>{phase.message}</span></p>;
}

function RestartErrorDetails({ phase }: { phase: Extract<RestartUiPhase, { status: "error" }> }) {
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!phase.logTail) return null;
  return <div className="space-y-2"><div className="flex flex-wrap gap-2"><button type="button" className="quiet-button" onClick={() => setLogOpen((open) => !open)}>{logOpen ? "Log ausblenden" : "Log anzeigen"}</button><button type="button" className="quiet-button" onClick={() => { void writeClipboardText(`Neustart (${phase.target}) fehlgeschlagen: ${phase.message}\n\n${phase.logTail}`).then(() => setCopied(true)).catch(() => setCopied(false)); }}><CopyIcon className="h-3.5 w-3.5" /> {copied ? "Kopiert" : "Log kopieren"}</button></div>{logOpen ? <pre className="restart-log">{phase.logTail}</pre> : null}</div>;
}

export function SystemRestartControls() {
  const { phase, restart } = useSystemRestart();
  const working = phase.status === "working";
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">{restartButtons.map(({ target, label, hint, icon: Icon }) => {
    const active = working && phase.target === target;
    return <button key={target} type="button" disabled={working} onClick={() => void restart(target)} className={`quiet-button grow basis-40 flex-col items-start gap-1 py-2.5 ${target === "both" ? "border-accent-line" : ""}`} title={hint}><span className="flex items-center gap-2 font-medium text-text">{active ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{label}</span><span className="text-[11px] text-faint">{hint}</span></button>;
  })}</div>{phase.status === "idle" ? <p className="text-[12px] text-faint">Geöffnete Panels, Arbeitsflächen, Terminals und gespeicherte Daten bleiben erhalten.</p> : <><RestartProgress phase={phase} />{phase.status === "error" ? <RestartErrorDetails phase={phase} /> : null}</>}</div>;
}
