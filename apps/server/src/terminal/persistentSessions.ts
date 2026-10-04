import type { TerminalDatabase } from "./database.js";
import { fromStored, requireValidCwd } from "./restore.js";
import type { TerminalSession } from "./session.js";

/** Nur unterbrochene, ausdrücklich persistente Sitzungen erlaubter Nutzer
 *  starten neu. Lebende tmux-Prozesse bleiben bis zum ersten Attach unberührt. */
export function restorePersistentSessions(deps: {
  database: TerminalDatabase | undefined;
  owners: readonly string[];
  allowedRoots: string[];
  sessions: Map<string, TerminalSession>;
  spawn(session: TerminalSession): void;
  persist(session: TerminalSession): void;
}): void {
  for (const owner of deps.owners) {
    for (const stored of deps.database?.persistentSessions(owner) ?? []) {
      const session = fromStored(stored);
      deps.sessions.set(session.id, session);
      try {
        session.cwd = requireValidCwd(session, deps.allowedRoots, deps.persist);
        session.epoch += 1;
        session.status = "starting";
        session.exitCode = null;
        session.exitSignal = null;
        session.updatedAt = Date.now();
        session.lastPersistedAt = undefined;
        deps.spawn(session);
      } catch {
        session.status = "interrupted";
        session.updatedAt = Date.now();
        session.lastPersistedAt = undefined;
        deps.persist(session);
      }
    }
  }
}
