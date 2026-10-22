import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { wraptQueries } from "../lib/queryOptions";
import { Link, useParams, useSearchParams } from "react-router";
import { WebTerminal } from "../components/terminal/WebTerminal";
import { TerminalToastRegion } from "../components/terminal/TerminalToastRegion";
import { useTerminalNotices } from "../components/terminal/terminalNotifications";

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
  useEffect(() => {
    if (!sessions.isLoading && !session) useTerminalNotices.getState().show({ id: "terminal:window", tone: "error", message: sessions.isError ? "Die Terminalsitzung konnte nicht geladen werden." : "Diese Terminalsitzung ist nicht mehr verfügbar." });
    else useTerminalNotices.getState().dismiss("terminal:window");
  }, [session, sessions.isError, sessions.isLoading]);

  if (sessions.isLoading) return <main className="terminal-window-route"><div className="terminal-area-loading">Terminal wird verbunden…</div></main>;
  if (!session) return <main className="terminal-window-route"><TerminalToastRegion /><div className="terminal-empty-state"><Link className="quiet-button-primary" to="/terminal">Terminals öffnen</Link></div></main>;

  return (
    <main className="terminal-window-route" aria-label={`${session.kind} Terminal`}>
      <TerminalToastRegion />
      <WebTerminal instanceId={session.runtimeId} sessionId={session.id} kind={session.kind} projectId={session.projectId} initialCwd={session.cwd} active keepAlive />
    </main>
  );
}
