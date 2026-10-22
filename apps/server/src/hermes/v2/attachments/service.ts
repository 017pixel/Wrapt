import { z } from "zod";
import type { HermesV2Message, HermesV2UploadStatus } from "@wrapt/contracts/hermes-v2";
import type { GatewayManager } from "../manager.js";
import type { OrganizationService } from "../organization/service.js";
import type { CwdPolicy } from "../cwd-policy.js";
import { GatewayError } from "../errors.js";
import { MutationOutcome } from "../mutation-outcome.js";
import { parse } from "../upstream-schemas.js";
import { text } from "../normalize-values.js";
import { AttachmentStore } from "./store.js";
import { captureAttachment, recheckAttachment, type AttachmentBinding } from "./binding.js";
import { openChecked, stagingRoots, verifyStaged } from "./files.js";
import { attachmentPolicy as p } from "./policy.js";
import { requireAttachmentHome } from "./scope-check.js";
import type { HistoryContext } from "../history-context.js";

export class AttachmentService {
  readonly store: AttachmentStore;
  private active = new Map<string, symbol>();
  constructor(private organization: OrganizationService, private find: (owner: string) => GatewayManager | undefined,
    private cwdPolicy: CwdPolicy, private display: (text: string) => string) { this.store = new AttachmentStore(organization.repo); }
  capture(owner: string, connection: string, session: string): Promise<AttachmentBinding> {
    const manager = this.find(owner);
    if (!manager) throw new GatewayError("FORBIDDEN", "Die Browser-Verbindung ist nicht aktiv.");
    return captureAttachment(manager, connection, session, this.organization);
  }
  acquire(owner: string): () => void {
    if (this.active.has(owner) || this.active.size >= p.concurrent) throw new GatewayError("RATE_LIMITED", "Es laufen bereits zu viele Uploads.");
    const token = Symbol("Uploadreservierung"); this.active.set(owner, token);
    return () => { if (this.active.get(owner) === token) this.active.delete(owner); };
  }
  reserve(owner: string, upload: string, binding: AttachmentBinding, filename: string, mime: string) {
    binding.assert();
    const sanitized = [...filename].map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      || character === "/" || character === "\\" ? "_" : character).join("");
    const name = this.display(text(sanitized.trim(), 200)).slice(0, 200) || "Datei";
    return this.store.reserve(owner, upload, binding, name, this.display(text(mime, 100)).slice(0, 100) || "application/octet-stream");
  }
  async stage(binding: AttachmentBinding, row: ReturnType<AttachmentStore["byId"]>, bytes: Buffer, signal: AbortSignal): Promise<HermesV2UploadStatus> {
    const outcome = new MutationOutcome();
    try {
      if (!bytes.length || bytes.length > p.fileBytes) throw new GatewayError("PAYLOAD_TOO_LARGE", "Die Datei ist leer oder zu groß.");
      return await binding.manager.runAttachmentStage(binding.record.storedId, async () => {
        try {
          const guard = () => { binding.assert(); if (signal.aborted) throw new GatewayError("STALE_REQUEST", "Der Upload wurde abgebrochen."); };
          guard(); await recheckAttachment(binding); guard();
          await stagingRoots(binding.scope, binding.cwd); guard();
          const ext = /\.[A-Za-z0-9]{1,12}$/.exec(row.name)?.[0] ?? ".bin";
          const name = `${row.id}${ext}`;
          const params = { session_id: binding.live, name, data_url: `data:application/octet-stream;base64,${bytes.toString("base64")}` };
          if (Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: Number.MAX_SAFE_INTEGER, method: "file.attach", params })) > binding.manager.policy.upstreamBytes)
            throw new GatewayError("PAYLOAD_TOO_LARGE", "Die Datei überschreitet das Gatewaybudget.");
          await requireAttachmentHome(binding.scope); guard();
          const raw = await outcome.call(binding.manager.upstream, "file.attach", params);
          guard();
          const value = parse(z.object({ attached: z.literal(true), uploaded: z.literal(true), name: z.string().max(300),
            path: z.string().max(4096), ref_path: z.string().max(4096), ref_text: z.string().max(4200) }), raw);
          await recheckAttachment(binding); guard();
          const file = await verifyStaged(value, name, binding.scope, binding.cwd, bytes); guard();
          await recheckAttachment(binding); guard();
          this.store.ready(row, bytes.length, file.path, file.root, file.fingerprint, file.reference);
          return this.safeStatus(this.store.get(row.owner, row.upload_id)!);
        } catch (error) {
          const failure = outcome.error(error);
          if (failure.outcome === "unknown") {
            binding.record.snapshot.running = null; binding.record.backgroundActive = null;
            binding.manager.sessions.protection.holdKnown(binding.canonical, binding.live, binding.epoch);
          }
          throw failure;
        }
      });
    } catch (error) {
      const failure = outcome.error(error); this.store.fail(row, failure.outcome);
      if (failure.code === "PROTOCOL_MISMATCH") binding.manager.upstream.protocolFault();
      throw failure;
    }
  }
  async resolveForSubmit(manager: GatewayManager, connection: string, session: string, ids: readonly string[], text: string) {
    const binding = await this.capture(manager.principal, connection, session);
    const references: string[] = [];
    for (const id of ids) {
      binding.assert();
      const row = this.store.byId(manager.principal, binding.scope.id, id);
      if (row.canonical !== binding.canonical || row.live !== binding.live || row.epoch !== binding.epoch || row.cwd !== binding.cwd)
        throw new GatewayError("STALE_REQUEST", "Der Anhang gehört nicht mehr zu dieser Runtimebindung.");
      const handle = await openChecked(row);
      try { binding.assert(); } finally { await handle.close(); }
      binding.assert();
      if (!row.reference) throw new GatewayError("STALE_REQUEST", "Die Dateireferenz fehlt.");
      references.push(row.reference);
    }
    await recheckAttachment(binding); binding.assert();
    const combined = `${text}${text ? "\n\n" : ""}${references.join("\n")}`;
    if (combined.length > 200_000 || Buffer.byteLength(combined) > manager.policy.browserBytes) throw new GatewayError("PAYLOAD_TOO_LARGE", "Nachricht und Dateireferenzen sind zu groß.");
    // Nach Promptannahme keinen frischen Activate-Nachweis über beobachtete Abweichungen legen.
    return { text: combined, assert: binding.assert, recheck: async () => {
      binding.assert();
      await requireAttachmentHome(binding.scope);
      binding.assert();
    } };
  }
  used(owner: string, ids: readonly string[], row: number | null): void { this.store.used(owner, ids, row); }
  async status(owner: string, upload: string): Promise<HermesV2UploadStatus> {
    const scope = await this.organization.context();
    const scopeRevision = this.organization.scopes.revision;
    await requireAttachmentHome(scope);
    if (this.organization.scopes.confirmed?.id !== scope.id || this.organization.scopes.revision !== scopeRevision)
      throw new GatewayError("STALE_REQUEST", "Der Profilkontext hat sich geändert.");
    const row = this.store.get(owner, upload);
    if (!row || row.scope !== scope.id || row.expires_at <= Date.now()) throw new GatewayError("SESSION_NOT_FOUND", "Dieser Upload ist nicht verfügbar.");
    return this.safeStatus(row);
  }
  private safeStatus(row: ReturnType<AttachmentStore["byId"]>): HermesV2UploadStatus {
    const status = this.store.status(row);
    return { ...status, attachment: status.attachment ? { ...status.attachment,
      name: this.display(status.attachment.name).slice(0, 200), mime: this.display(status.attachment.mime).slice(0, 100) } : null };
  }
  async download(owner: string, id: string) {
    const scope = await this.organization.context();
    await requireAttachmentHome(scope);
    const row = this.store.byId(owner, scope.id, id);
    await this.cwdPolicy.validate(row.cwd);
    await requireAttachmentHome(scope);
    const roots = await stagingRoots(scope, row.cwd);
    await requireAttachmentHome(scope);
    if (!row.root || !roots.includes(row.root)) throw new GatewayError("PROJECT_FORBIDDEN", "Der Stagingpfad ist nicht bestätigt.");
    const handle = await openChecked(row);
    try {
      await requireAttachmentHome(scope);
      if (this.organization.scopes.confirmed?.id !== scope.id) throw new GatewayError("STALE_REQUEST", "Der Profilkontext hat sich geändert.");
      return { handle, row: { ...row, name: this.display(row.name) } };
    } catch (error) { await handle.close(); throw error; }
  }
  async history(owner: string, canonical: string, profile: string | undefined, rows: readonly HermesV2Message[], context: HistoryContext): Promise<void> {
    if (profile !== context.scope.profile || !await context.current()) return;
    this.store.history(owner, context.scope.id, canonical, rows);
  }
}
