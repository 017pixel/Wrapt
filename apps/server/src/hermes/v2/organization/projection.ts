import type { HermesV2Event, HermesV2Message, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import type { SessionRecord, UpstreamEvent } from "../types.js";
import type { OrganizationRepository } from "./repository.js";
import type { OrganizationScope } from "./scope.js";
import type { EvidenceRegistry } from "./evidence.js";
import { answerSource, projectedSources, linkEqual, rowWitness } from "./sources.js";
import { organizationPolicy } from "./policy.js";

interface Witness { scope: string; session: string; sources: readonly string[] }
/** WeakMaps halten nur Belege derselben tatsächlichen Ausgabe, keine Transcriptkopie. */
export class ReadProjection {
  private witnesses = new WeakMap<object, Witness>();
  constructor(private repo: OrganizationRepository, private evidence: EvidenceRegistry, private now = Date.now) {}
  copyRows(from: readonly HermesV2Message[], to: readonly HermesV2Message[]): void {
    // Zod kopiert Objekte, verändert diese geordnete Projektion jedoch nicht.
    if (from.length !== to.length) return;
    from.forEach((row, index) => {
      const copy = to[index]!;
      const witness = this.witnesses.get(row);
      if (witness && row.id === copy.id && row.rowId === copy.rowId && row.logicalId === copy.logicalId && row.role === copy.role) this.witnesses.set(copy, witness);
    });
  }
  history(scope: OrganizationScope, session: string, raw: readonly unknown[], messages: readonly HermesV2Message[]): void {
    this.repo.transaction(() => {
      for (const value of raw) {
        const row = object(value);
        // Auch eine nicht lesbar projizierte Row kann einen früheren physischen Zeugen widerlegen.
        const source = answerSource(this.repo, scope.id, session, row, this.now());
        if (!source) continue;
        const id = row.id ?? row.row_id ?? row._row_id;
        const message = messages.find((entry) => entry.role === "assistant" && entry.rowId === id);
        if (!message) continue;
        const content = object(row.display_metadata).display_text ?? row.display_content ?? row.text ?? row.content;
        const reasoning = row.reasoning ?? row.reasoning_content;
        if (typeof content !== "string" || content !== message.text || (typeof reasoning === "string" && reasoning !== message.reasoning)) continue;
        const sources = projectedSources(this.repo, source, row, session);
        this.witnesses.set(message, { scope: scope.id, session, sources });
        if (source.available === 0) {
          this.repo.markAvailable(source, this.now());
        }
      }
    });
  }
  event(scope: OrganizationScope, record: SessionRecord, raw: UpstreamEvent, normalized: HermesV2Event): void {
    if ((normalized.type !== "message.completed" && normalized.type !== "session.error") || !record.liveId || !raw.seq || raw.session_id !== record.liveId) return;
    this.repo.transaction(() => {
      const sources: string[] = [];
      const key = `${record.epoch}:${record.liveId}:${raw.seq}`;
      if (normalized.type === "message.completed") {
        const row = normalized.payload.persistedTurn;
        const source = this.repo.source(scope.id, record.storedId, "answer", `event:${key}`, {
          epoch: record.epoch, live_id: record.liveId, seq: raw.seq!, row_id: row?.complete ? row.assistantRowId : null,
        });
        this.repo.markAvailable(source, this.now());
        if (source.row_id !== null) {
          const uid = rowWitness(this.repo, scope.id, record.storedId, source.row_id);
          if (uid) linkEqual(this.repo, source, this.repo.source(scope.id, record.storedId, "answer", `uid:${uid}`, { uid }), this.now());
        }
        this.repo.fact(source, "live-turn-end", this.now());
        const original = object(raw.payload);
        if (typeof original.text === "string" && original.text === normalized.payload.text
          && (typeof original.reasoning !== "string" || original.reasoning === normalized.payload.reasoning)) sources.push(source.id);
        if (normalized.payload.error) {
          const error = this.repo.source(scope.id, record.storedId, "error", `error:${key}`, { epoch: record.epoch, live_id: record.liveId, seq: raw.seq! });
          this.repo.fact(error, "decision-error", this.now()); sources.push(error.id);
        }
      } else {
        const source = this.repo.source(scope.id, record.storedId, "error", `error:${key}`, { epoch: record.epoch, live_id: record.liveId, seq: raw.seq! });
        this.repo.fact(source, "decision-error", this.now()); sources.push(source.id);
      }
      if (sources.length) this.witnesses.set(normalized, { scope: scope.id, session: record.storedId, sources });
    });
  }
  frame(owner: string, original: HermesV2ServerMessage, enabled: boolean): HermesV2ServerMessage {
    const row = (message: HermesV2Message): HermesV2Message => {
      const base = { ...message };
      delete base.readEvidence;
      if (!enabled) return base;
      return { ...base, readEvidence: this.handle(owner, message) };
    };
    if (original.type === "snapshot") return { ...original, snapshot: { ...original.snapshot, messages: original.snapshot.messages.map(row) } };
    if (original.type === "result") {
      if (original.op === "history.read") return { ...original, data: { ...original.data, messages: original.data.messages.map(row) } };
      if (original.op === "session.create" || original.op === "session.subscribe") return { ...original, data: { snapshot: { ...original.data.snapshot, messages: original.data.snapshot.messages.map(row) } } };
    }
    if (original.type === "event" && (original.event.type === "message.completed" || original.event.type === "session.error")) {
      // Beide Ereignisse behalten ihren jeweiligen Diskriminator und Payloadtyp.
      if (original.event.type === "message.completed") {
        const payload = { ...original.event.payload }; delete payload.readEvidence;
        return { ...original, event: { ...original.event, payload: { ...payload, ...(enabled ? { readEvidence: this.handle(owner, original.event) } : {}) } } };
      }
      const payload = { ...original.event.payload }; delete payload.readEvidence;
      return { ...original, event: { ...original.event, payload: { ...payload, ...(enabled ? { readEvidence: this.handle(owner, original.event) } : {}) } } };
    }
    return original;
  }
  private handle(owner: string, object: object): string | null {
    const witness = this.witnesses.get(object);
    if (witness && witness.sources.length > organizationPolicy.sourcesPerEvidence) {
      this.repo.transaction(() => this.repo.setCoverage(witness.scope, witness.session, "gap", "EVIDENCE_TOO_BROAD", String(witness.sources.length), this.now()));
      return null;
    }
    return witness && this.repo.coverage(witness.scope, witness.session).state !== "identity-unknown"
      ? this.evidence.evidence(owner, witness.scope, witness.session, witness.sources) : null;
  }
}
