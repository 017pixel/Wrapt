import type { TerminalSession } from "./session.js";

/**
 * Ein lebender Session-Eigentümer nutzt denselben Supervisor-Namen. Eine
 * geschlossene Session zählt nicht; eine noch lebende Generation derselben
 * Session dagegen schon. So beendet ein veralteter Spawn niemals die Pane,
 * die eine neuere Generation gerade übernommen hat.
 */
export function hasLiveSupervisorOwner(
  sessions: Iterable<TerminalSession>,
  name: string,
): boolean {
  for (const session of sessions) {
    if (session.status !== "closed" && session.supervisorName === name) return true;
  }
  return false;
}

/**
 * Entfernt eine neu erzeugte Runtime, die keine lebende Session mehr
 * übernehmen darf. So hinterlässt ein Close während einer laufenden Recovery
 * keine Pane, die beim nächsten Listen als Geistersitzung importiert würde.
 */
export async function discardUnclaimedRuntime(
  supervisor: { terminate(name: string): Promise<void> | void } | undefined,
  name: string,
  created: boolean,
  claimedByOwner: boolean,
  onDiscarded?: (name: string) => void,
  onFailure?: (name: string) => void,
): Promise<void> {
  if (!supervisor || !created || claimedByOwner) return;
  try {
    await supervisor.terminate(name);
    onDiscarded?.(name);
  } catch {
    // Der Lifecycle merkt sich den Namen und versucht die Löschung erneut,
    // statt die verwaiste Pane beim nächsten Listen zu importieren.
    onFailure?.(name);
  }
}
