import type { PreviewRuntimeLogLevel, PreviewRuntimeService, PreviewRuntimeServiceStatus } from "@wrapt/contracts";

export interface PaneState {
  serviceId: string;
  dead: boolean;
  exitCode: number | null;
  pid: number | null;
  startedAt: string | null;
}


export function logLevel(text: string): PreviewRuntimeLogLevel {
  if (/\b(error|failed|exception|fatal|err!|eaddrinuse|unhandled)\b/i.test(text)) return "error";
  if (/\b(warn|warning|deprecated)\b/i.test(text)) return "warning";
  if (/\b(ready|listening|started|compiled|built|success|local:)\b/i.test(text)) return "success";
  return "info";
}

export function serviceState(service: PreviewRuntimeService, pane: PaneState | undefined): PreviewRuntimeServiceStatus {
  if (!pane) return { ...service, state: "stopped", pid: null, startedAt: null, exitCode: null, message: null };
  const state = pane.dead ? (pane.exitCode === 0 ? "stopped" : "failed") : "running";
  return {
    ...service, state, pid: pane.dead ? null : pane.pid, startedAt: pane.startedAt, exitCode: pane.exitCode,
    message: state === "failed" ? `${service.name} wurde mit Exit-Code ${pane.exitCode ?? "unbekannt"} beendet.` : null,
  };
}

