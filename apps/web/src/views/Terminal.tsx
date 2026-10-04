import { useQuery } from "@tanstack/react-query";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { wraptQueries } from "../lib/queryOptions";
import { useParams, useSearchParams } from "react-router";
import { WebTerminal } from "../components/terminal/WebTerminal";

export function TerminalView() {
  const [search] = useSearchParams();
  const kind = search.get("kind") === "claude" ? "claude" as const : "shell" as const;
  return <div className="terminal-route"><TerminalArea areaId="standalone" kind={kind} requestedSessionId={search.get("session")} /></div>;
}

/** Eigenständiges Browserfenster für genau eine bereits laufende Sitzung. */
export function TerminalWindowRoute() {
  const { runtimeId = "" } = useParams();
  const sessions = useQuery(wraptQueries.terminalSessions());
  const session = sessions.data?.sessions.find((candidate) => candidate.runtimeId === runtimeId);

  if (sessions.isLoading) return <main className="terminal-window-route"><div className="terminal-area-loading">Terminal wird verbunden…</div></main>;
  if (!session) return <main className="terminal-window-route"><div className="terminal-window-error" role="alert">Diese Terminalsitzung ist nicht mehr verfügbar.</div></main>;

  return (
    <main className="terminal-window-route" aria-label={`${session.kind} Terminal`}>
      <WebTerminal instanceId={session.runtimeId} kind={session.kind} projectId={session.projectId} initialCwd={session.cwd} active keepAlive />
    </main>
  );
}
