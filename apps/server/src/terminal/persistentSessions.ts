import type { TerminalDatabase, StoredTerminalSession } from "./database.js";
import { fromStored, requireValidCwd } from "./restore.js";
import type { TerminalSession } from "./session.js";

/** Begrenzt parallele Neustarts: Jeder Start kostet einen tmux- und einen
 *  PTY-Prozess. Zwei gleichzeitig halten den Backend-Start kurz und schonen
 *  den Host, ohne die Wiederherstellung unnötig zu serialisieren. */
const RESTORE_CONCURRENCY = 2;

async function restoreOne(deps: {
  allowedRoots: string[];
  deniedRoots: string[];
  sessions: Map<string, TerminalSession>;
  spawn(session: TerminalSession): Promise<void>;
  persist(session: TerminalSession): void;
}, stored: StoredTerminalSession): Promise<void> {
  const session = fromStored(stored);
  deps.sessions.set(session.id, session);
  try {
    session.cwd = requireValidCwd(session, deps.allowedRoots, deps.persist, deps.deniedRoots);
    session.epoch += 1;
    session.status = "starting";
    session.exitCode = null;
    session.exitSignal = null;
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    await deps.spawn(session);
  } catch {
    session.status = "interrupted";
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    deps.persist(session);
  }
}

/** Nur unterbrochene, ausdrücklich persistente Sitzungen erlaubter Nutzer
 *  starten neu. Lebende tmux-Prozesse bleiben bis zum ersten Attach unberührt. */
export async function restorePersistentSessions(deps: {
  database: TerminalDatabase | undefined;
  owners: readonly string[];
  allowedRoots: string[];
  deniedRoots?: string[];
  sessions: Map<string, TerminalSession>;
  spawn(session: TerminalSession): Promise<void>;
  persist(session: TerminalSession): void;
}): Promise<void> {
  const context = {
    allowedRoots: deps.allowedRoots,
    deniedRoots: deps.deniedRoots ?? [],
    sessions: deps.sessions,
    spawn: deps.spawn,
    persist: deps.persist,
  };
  const seen = new Set<string>();
  const candidates: StoredTerminalSession[] = [];
  for (const owner of deps.owners) {
    for (const stored of deps.database?.persistentSessions(owner) ?? []) {
      // Workspace-Einträge können dieselbe Runtime mehrfach referenzieren.
      const key = `${stored.userId}\u0000${stored.runtimeId}`;
      if (seen.has(key) || deps.sessions.has(stored.id)) continue;
      seen.add(key);
      candidates.push(stored);
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const stored = candidates[next++];
      if (stored) await restoreOne(context, stored);
    }
  };
  await Promise.all(Array.from({ length: Math.min(RESTORE_CONCURRENCY, candidates.length) }, worker));
}
