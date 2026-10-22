import { realpath } from "node:fs/promises";
import type { GatewayManager } from "../manager.js";
import type { OrganizationService } from "../organization/service.js";
import type { OrganizationScope } from "../organization/scope.js";
import type { SessionRecord } from "../types.js";
import { GatewayError } from "../errors.js";
import { captureAttachmentHome, requireAttachmentHome } from "./scope-check.js";

export interface AttachmentBinding {
  manager: GatewayManager; record: SessionRecord; scope: OrganizationScope; cwd: string;
  canonical: string; live: string; epoch: string; connection: string; generation: number;
  assert(): void;
}
export async function captureAttachment(manager: GatewayManager, connection: string, session: string, organization: OrganizationService): Promise<AttachmentBinding> {
  if (!manager.connections.get(connection)?.composer) throw new GatewayError("FORBIDDEN", "Diese Verbindung erlaubt keine Anhänge.");
  const record = manager.requireSession(session, connection);
  const generation = manager.subscriptions.get(connection, session);
  if (generation === undefined || record.hydrating || !record.liveId) throw new GatewayError("STALE_REQUEST", "Das Sessionabo ist nicht bereit.");
  const guard = manager.mutationGuard(connection, record);
  const canonical = record.canonicalId;
  const live = record.liveId;
  const epoch = record.epoch;
  const contextRevision = record.contextRevision ?? 0;
  const assert = () => {
    guard();
    if (manager.subscriptions.get(connection, session) !== generation || record.canonicalId !== canonical || record.hydrating
      || (record.contextRevision ?? 0) !== contextRevision)
      throw new GatewayError("STALE_REQUEST", "Das Sessionabo hat sich geändert.");
  };
  assert();
  const scope = await organization.context(); assert();
  const scopeRevision = organization.scopes.revision;
  const home = captureAttachmentHome(scope, organization.scopes);
  const scopeGuard = () => {
    assert();
    home.assert();
    if (record.profileName !== scope.profile || organization.scopes.confirmed?.id !== scope.id || organization.scopes.revision !== scopeRevision)
      throw new GatewayError("STALE_REQUEST", "Das frische Sessionprofil ist nicht bestätigt.");
  };
  await requireAttachmentHome(scope); scopeGuard();
  await manager.sessions.writable(record); scopeGuard();
  await requireAttachmentHome(scope); scopeGuard();
  const spelling = record.snapshot.session.cwd;
  const cwd = await realpath(spelling!); scopeGuard();
  await requireAttachmentHome(scope); scopeGuard();
  return { manager, record, scope, cwd, canonical, live, epoch, connection, generation, assert: () => {
    scopeGuard();
    if (record.snapshot.session.cwd !== spelling) throw new GatewayError("STALE_REQUEST", "Das Arbeitsverzeichnis hat sich geändert.");
  } };
}
export async function recheckAttachment(binding: AttachmentBinding): Promise<void> {
  binding.assert();
  await requireAttachmentHome(binding.scope); binding.assert();
  await binding.manager.sessions.writable(binding.record); binding.assert();
  await requireAttachmentHome(binding.scope); binding.assert();
  const current = await realpath(binding.record.snapshot.session.cwd!); binding.assert();
  await requireAttachmentHome(binding.scope); binding.assert();
  if (current !== binding.cwd) throw new GatewayError("STALE_REQUEST", "Das Arbeitsverzeichnis hat sich geändert.");
}
