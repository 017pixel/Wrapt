import { randomBytes } from "node:crypto";
import { organizationPolicy } from "./policy.js";
import { OrganizationError } from "./errors.js";

interface BoundValue<T> { owner: string; scope: string; session: string; expiresAt: number; value: T }
export class BoundRegistry<T> {
  private readonly entries = new Map<string, BoundValue<T>>();
  constructor(private ttl: number, private perOwner: number, private total: number, private now = Date.now) {}
  issue(owner: string, scope: string, session: string, value: T): { handle: string; expiresAt: number } {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    const ownerEntries = [...this.entries].filter(([, entry]) => entry.owner === owner);
    while (ownerEntries.length >= this.perOwner) this.entries.delete(ownerEntries.shift()![0]);
    while (this.entries.size >= this.total) this.entries.delete(this.entries.keys().next().value!);
    const handle = randomBytes(32).toString("hex");
    const expiresAt = now + this.ttl;
    this.entries.set(handle, { owner, scope, session, value, expiresAt });
    return { handle, expiresAt };
  }
  get(handle: string, owner: string, scope: string, session?: string): T {
    const entry = this.entries.get(handle);
    if (!entry || entry.owner !== owner || entry.scope !== scope || (session !== undefined && entry.session !== session)) {
      throw new OrganizationError(400, "READ_EVIDENCE_INVALID", "Der Lesebeleg ist nicht gültig.");
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(handle);
      throw new OrganizationError(410, "READ_EVIDENCE_EXPIRED", "Der Lesebeleg ist abgelaufen. Bitte den Chat neu abgleichen.");
    }
    return entry.value;
  }
  remove(handle: string): void { this.entries.delete(handle); }
  clear(): void { this.entries.clear(); }
}
export class EvidenceRegistry extends BoundRegistry<readonly string[]> {
  constructor(now = Date.now) { super(organizationPolicy.evidenceTtlMs, organizationPolicy.evidencePerOwner, organizationPolicy.evidenceTotal, now); }
  evidence(owner: string, scope: string, session: string, sources: readonly string[]): string | null {
    const exact = [...new Set(sources)];
    if (!exact.length || exact.length > organizationPolicy.sourcesPerEvidence) return null;
    return this.issue(owner, scope, session, Object.freeze(exact)).handle;
  }
}
