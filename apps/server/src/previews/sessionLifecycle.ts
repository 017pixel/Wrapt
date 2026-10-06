import type { PreviewSlotDatabase, SessionRow } from "./database.js";
import { AppError } from "../utils/errors.js";
import type { PreviewDevServerManager } from "./DevServerManager.js";
import type { PreviewSlotService } from "./slots.js";

export async function closePreviewByKey(slots: PreviewSlotService, runtimes: PreviewDevServerManager, userId: string, key: string): Promise<void> {
  if (key.startsWith("preview-runtime:")) await runtimes.releasePublication(userId, key.slice("preview-runtime:".length));
  slots.closeSession(userId, key);
}

export async function closePreviewById(slots: PreviewSlotService, runtimes: PreviewDevServerManager, userId: string, id: string): Promise<void> {
  const session = slots.assertSessionOwned(userId, id);
  await closePreviewByKey(slots, runtimes, userId, session.sessionKey);
}

export function renewOwnedPreviewLease(database: PreviewSlotDatabase, userId: string, sessionId: string, duration: number): SessionRow {
  const session = database.sessionById(sessionId);
  if (!session || session.userId !== userId) {
    throw new AppError(404, "PREVIEW_SESSION_NOT_FOUND", "Diese Preview-Session gehört nicht zu deinem Benutzer.");
  }
  const leaseExpiresAt = new Date(Date.now() + duration).toISOString();
  database.renewLease(sessionId, leaseExpiresAt);
  return { ...session, leaseExpiresAt };
}

/** Aufräumen muss ebenso wie eine explizite Freigabe die Routingrevision ändern. */
export function expirePreviewSessions(database: PreviewSlotDatabase, release: (slots: number[]) => void): void {
  const expired = database.deleteExpiredSessions(new Date().toISOString());
  if (!expired.length) return;
  release(expired);
  database.nextRoutingRevision();
}
