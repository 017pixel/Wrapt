import type { GatewayDependencies } from "../types.js";
import type { GatewayPool } from "../pool.js";
import type { OrganizationService } from "../organization/service.js";
import type { SecretRedactor } from "../secret-redactor.js";
import { resourceContext, type ResourceContext } from "./context.js";
import { ResourceError, upstreamResource } from "./errors.js";
import { DeletionPreviews } from "./previews.js";

export class ResourceMutation {
  sent = false;
  accepted = false;
  async send(host: ResourceHost, binding: ResourceContext, method: "post" | "put" | "delete", path: string, body?: unknown, beforeSend?: () => void | Promise<void>): Promise<unknown> {
    const writer = host.deps.resources?.writer;
    if (!writer) throw new ResourceError(503, "UNSUPPORTED", "Native Ressourcenmutationen sind hier nicht verfügbar.");
    await binding.current(); await beforeSend?.(); binding.assert();
    this.sent = true;
    let result: unknown;
    try { result = await (method === "delete" ? writer.delete(path) : writer[method](path, body)); }
    catch (error) {
      const failure = upstreamResource(error);
      if (!this.accepted && failure.outcome === "rejected") { this.sent = false; throw failure; }
      throw error;
    }
    this.accepted = true; await binding.current(); binding.assert(); return result;
  }
  failure(error: unknown): ResourceError {
    if (this.sent) return new ResourceError(503, "UNKNOWN_OUTCOME", "Hermes könnte die Änderung angenommen haben. Bitte vor einem neuen Versuch bewusst neu lesen.", "unknown");
    return error instanceof ResourceError ? error : upstreamResource(error);
  }
}
export class ResourceHost {
  readonly deletions = new DeletionPreviews();
  private disposed = false;
  constructor(readonly pool: GatewayPool, readonly deps: GatewayDependencies, readonly organization: OrganizationService, readonly secrets: SecretRedactor) {}
  context(expected?: string, active = () => true) {
    return resourceContext(this.deps, this.organization, () => !this.disposed && active(), expected);
  }
  async read(binding: ResourceContext, path: string): Promise<unknown> {
    binding.assert(); let value: unknown;
    try { value = await this.deps.dashboard.get(path); } catch (error) { throw upstreamResource(error); }
    await binding.current(); binding.assert();
    if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024) throw new ResourceError(502, "RATE_LIMITED", "Die native Ressource ist zu groß.");
    return value;
  }
  path(binding: ResourceContext, path: string) { return `${path}${path.includes("?") ? "&" : "?"}profile=${encodeURIComponent(binding.scope.profile)}`; }
  dispose(): void { this.disposed = true; this.deletions.clear(); }
}
