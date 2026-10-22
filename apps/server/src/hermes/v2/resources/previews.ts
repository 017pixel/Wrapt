import { ResourceError } from "./errors.js";

interface Preview { owner: string; id: string; scope: string; identity: string; expires: number }
/** Flüchtige, begrenzte Bestätigung genau einer frisch gelesenen Löschwirkung. */
export class DeletionPreviews {
  private entries = new Map<string, Preview>();
  issue(owner: string, id: string, scope: string, identity: string): string {
    for (const [key, value] of this.entries) if (value.expires <= Date.now() || value.owner === owner && value.id === id) this.entries.delete(key);
    if (this.entries.size >= 128) this.entries.delete(this.entries.keys().next().value!);
    const key = JSON.stringify([owner, id, scope]);
    this.entries.set(key, { owner, id, scope, identity, expires: Date.now() + 5 * 60_000 }); return scope;
  }
  consume(owner: string, id: string, token: string): Preview {
    const key = JSON.stringify([owner, id, token]); const value = this.entries.get(key);
    if (!value || value.owner !== owner || value.id !== id || value.expires <= Date.now()) throw new ResourceError(409, "STALE_RESOURCE_CONTEXT", "Die genaue Löschvorschau muss neu gelesen und bestätigt werden.");
    this.entries.delete(key); return value;
  }
  clear(): void { this.entries.clear(); }
}
