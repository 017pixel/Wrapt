import type { SessionRecord } from "./types.js";

/** Beobachtete Profil-/CWD-Wechsel bleiben über A-B-A und spätere Awaits sichtbar. */
export function observeSessionContext(record: SessionRecord, info: Record<string, unknown>, authoritative = false): void {
  const hasProfile = authoritative || Object.hasOwn(info, "profile_name");
  const profile = typeof info.profile_name === "string" ? info.profile_name : null;
  if (hasProfile && profile !== record.profileName || typeof info.cwd === "string" && info.cwd !== record.snapshot.session.cwd)
    record.contextRevision = (record.contextRevision ?? 0) + 1;
  if (hasProfile) record.profileName = profile;
}
