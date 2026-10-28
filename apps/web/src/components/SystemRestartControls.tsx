import { useEffect, useRef, useState } from "react";
import type { RestartTarget } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../lib/apiClient";
import { editorsHaveUnsavedChanges } from "../lib/reloadGuard";
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
const RESTART_POLL_MS = 1_500;

/** Testnaht: Im Browser window-APIs, im Test stubbar — Verhalten unverändert. */
export const restartEnv = {
  reload: () => window.location.reload(),
  confirmDirty: () => window.confirm("Es gibt ungespeicherte Änderungen in einem Editor. Trotzdem neu laden?"),
};

export interface SystemRestartOptions {
  deadlineMs?: number;
  pollMs?: number;
}

export function useSystemRestart(options: SystemRestartOptions = {}) {
  const deadlineMs = options.deadlineMs ?? RESTART_DEADLINE_MS;
  const pollMs = options.pollMs ?? RESTART_POLL_MS;
  const [phase, setPhase] = useState<RestartUiPhase>({ status: "idle" });
  const generationRef = useRef(0);

  useEffect(() => () => { generationRef.current += 1; }, []);

  async function waitForResult(target: RestartTarget, baseline: { jobId: string; bootId: string; webBuildId: number | null }, generation: number) {
    const deadline = Date.now() + deadlineMs;
    let lastLogTail = "";
    let scriptFinished = false;
    while (Date.now() < deadline) {
      await sleep(pollMs);
      if (generationRef.current !== generation) return { ok: false, message: "Beobachtung beendet.", logTail: lastLogTail } as const;
      try {
        const status = await apiClient.restartStatus();
        if (generationRef.current !== generation) return { ok: false, message: "Beobachtung beendet.", logTail: lastLogTail } as const;
        if (!status) continue;
        if (status.jobId !== baseline.jobId) continue;
        lastLogTail = status.logTail || lastLogTail;
        if (status.phase === "failed") {
          return { ok: false, message: status.message || "Der Neustart ist fehlgeschlagen.", logTail: status.logTail } as const;
        }
        if (status.phase === "running" && status.step) setPhase({ status: "working", target, step: status.step });
        scriptFinished = status.phase === "succeeded";
        const backendRestarted = status.bootId !== baseline.bootId;
        const frontendRebuilt = status.webBuildId !== null && status.webBuildId !== baseline.webBuildId;
        const markersChanged = target === "frontend" ? frontendRebuilt : target === "backend" ? backendRestarted : backendRestarted && frontendRebuilt;
        if (scriptFinished && markersChanged) return { ok: true } as const;
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

  async function run(target: RestartTarget, trigger: () => ReturnType<typeof apiClient.restartSystem>) {
    const generation = ++generationRef.current;
    setPhase({ status: "working", target, step: "Neustart wird angestoßen …" });
    try {
      const response = await trigger();
      if (!response) throw new Error("Keine Antwort vom Server erhalten.");
      if (generationRef.current !== generation) return;
      const result = await waitForResult(target, response, generation);
      if (generationRef.current !== generation) return;
      if (result.ok) {
        // Dirty-Guard (U-002): Der Neustart killt auch laufende KI-Sitzungen und
        // Verwirft Filter-/Scroll-Kontext; ungespeicherte Editor-Inhalte vorher bestätigen.
        if (editorsHaveUnsavedChanges() && !restartEnv.confirmDirty()) {
          setPhase({ status: "idle" });
          return;
        }
        restartEnv.reload();
        return;
      }
      setPhase({ status: "error", target, message: result.message, logTail: result.logTail });
    } catch (error) {
      if (generationRef.current !== generation) return;
      const message = error instanceof ApiClientError ? error.message : "Der Neustart konnte nicht ausgelöst werden.";
      const status = await apiClient.restartStatus().catch(() => null);
      if (generationRef.current !== generation) return;
      setPhase({ status: "error", target, message, logTail: status?.logTail ?? "" });
    }
  }

  function cancel() {
    generationRef.current += 1;
    setPhase({ status: "idle" });
  }

  return { phase, restart: (target: RestartTarget) => run(target, () => apiClient.restartSystem(target)), update: () => run("both", () => apiClient.triggerUpdate()), cancel };
}

export function RestartProgress({ phase }: { phase: Exclude<RestartUiPhase, { status: "idle" }> }) {
  if (phase.status === "working") {
    return <div className="space-y-1" role="status"><span className="flex items-center gap-2 text-[12px] text-muted"><LoaderIcon className="h-3.5 w-3.5 shrink-0 animate-spin" /> {restartWorkingLabel[phase.target]} Die Seite lädt danach automatisch neu.</span><small className="block pl-[22px] text-[11px] text-faint">{phase.step}</small></div>;
  }
  return <p className="flex items-start gap-2 text-[12px] text-bad" role="alert"><WarningIcon className="h-3.5 w-3.5 shrink-0" /> <span>{phase.message}</span></p>;
}

export function RestartErrorDetails({ phase }: { phase: Extract<RestartUiPhase, { status: "error" }> }) {
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!phase.logTail) return null;
  return <div className="space-y-2"><div className="flex flex-wrap gap-2"><button type="button" className="quiet-button" onClick={() => setLogOpen((open) => !open)}>{logOpen ? "Log ausblenden" : "Log anzeigen"}</button><button type="button" className="quiet-button" onClick={() => { void writeClipboardText(`Neustart (${phase.target}) fehlgeschlagen: ${phase.message}\n\n${phase.logTail}`).then(() => setCopied(true)).catch(() => setCopied(false)); }}><CopyIcon className="h-3.5 w-3.5" /> {copied ? "Kopiert" : "Log kopieren"}</button></div>{logOpen ? <pre className="restart-log">{phase.logTail}</pre> : null}</div>;
}

export function SystemRestartControls() {
  const { phase, restart, cancel } = useSystemRestart();
  const working = phase.status === "working";
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">{restartButtons.map(({ target, label, hint, icon: Icon }) => {
    const active = working && phase.target === target;
    return <button key={target} type="button" disabled={working} onClick={() => void restart(target)} className={`quiet-button grow basis-40 flex-col items-start gap-1 py-2.5 ${target === "both" ? "border-accent-line" : ""}`} title={hint}><span className="flex items-center gap-2 font-medium text-text">{active ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{label}</span><span className="text-[11px] text-faint">{hint}</span></button>;
  })}</div>{phase.status === "idle" ? <p className="text-[12px] text-faint">Geöffnete Panels, Arbeitsflächen, Terminals und gespeicherte Daten bleiben erhalten. Ein Neustart beendet laufende KI-Sitzungen.</p> : <><RestartProgress phase={phase} />{phase.status === "working" ? <div className="space-y-2"><button type="button" className="quiet-button min-h-11 px-4" onClick={cancel}>Beobachtung beenden</button><p className="text-[12px] text-faint">Der Serverauftrag läuft beim Beenden der Beobachtung weiter.</p></div> : null}{phase.status === "error" ? <RestartErrorDetails phase={phase} /> : null}</>}</div>;
}
