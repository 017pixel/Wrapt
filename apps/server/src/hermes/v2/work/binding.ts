import { realpath } from "node:fs/promises";
import type { GatewayManager } from "../manager.js";
import type { OrganizationService } from "../organization/service.js";
import { GatewayError } from "../errors.js";
import { requireAttachmentHome } from "../attachments/scope-check.js";

export async function captureWork(manager: GatewayManager, connection: string, session: string, organization: OrganizationService | undefined) {
  if (!manager.connections.get(connection)?.work) throw new GatewayError("FORBIDDEN", "Diese Verbindung erlaubt keine Laufaufgaben.");
  if (!organization) throw new GatewayError("SESSION_UNAVAILABLE", "Der Profilkontext ist nicht bestätigt.");
  const record = manager.requireSession(session, connection);
  const generation = manager.subscriptions.get(connection, session);
  const guard = manager.mutationGuard(connection, record);
  const live = record.liveId; const epoch = record.epoch; const canonical = record.canonicalId;
  const contextRevision = record.contextRevision ?? 0;
  const initial = () => {
    guard();
    if (!manager.connections.get(connection)?.work || !live || record.hydrating || generation === undefined || manager.subscriptions.get(connection, session) !== generation
      || record.canonicalId !== canonical || (record.contextRevision ?? 0) !== contextRevision) throw new GatewayError("STALE_REQUEST", "Das Sessionabo hat sich geändert.");
  };
  initial(); const scope = await organization.context(); initial();
  const revision = organization.scopes.revision; const spelling = record.snapshot.session.cwd;
  const assert = () => {
    initial();
    if (organization.scopes.confirmed?.id !== scope.id || organization.scopes.revision !== revision || record.profileName !== scope.profile
      || record.snapshot.session.cwd !== spelling) throw new GatewayError("STALE_REQUEST", "Der Kontext der Laufaufgabe hat sich geändert.");
  };
  assert(); await requireAttachmentHome(scope); assert();
  const cwd = await realpath(spelling!); assert();
  const reply = await manager.sessions.writable(record); assert();
  const current = async () => {
    assert(); await requireAttachmentHome(scope); assert();
    const resolved = await realpath(spelling!); assert();
    if (resolved !== cwd) throw new GatewayError("STALE_REQUEST", "Das Arbeitsverzeichnis hat sich geändert.");
    await requireAttachmentHome(scope); assert();
  };
  await current(); assert();
  return { record, live, epoch, reply, assert, current };
}
