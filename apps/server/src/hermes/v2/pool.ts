import { GatewayManager } from "./manager.js";
import { RequestRegistry } from "./request-registry.js";
import { hermesV2Policy, type HermesV2Policy } from "./policy.js";
import { GatewayError } from "./errors.js";
import type { GatewayDependencies } from "./types.js";
import { SecretRedactor } from "./secret-redactor.js";
import { OrganizationService } from "./organization/service.js";
import { readActivity } from "./organization/activity.js";
import { AttachmentService } from "./attachments/service.js";
import { CwdPolicy } from "./cwd-policy.js";
import { ResourceHost } from "./resources/host.js";

export class GatewayPool {
  readonly policy: HermesV2Policy;
  readonly registry = new RequestRegistry();
  private readonly secrets: SecretRedactor;
  private managers = new Map<string, GatewayManager>();
  private idle = new Map<string, NodeJS.Timeout>();
  private disposed = false;
  private readonly deps: GatewayDependencies;
  readonly organization: OrganizationService | undefined;
  readonly attachments: AttachmentService | undefined;
  readonly resources: ResourceHost | undefined;

  constructor(deps: GatewayDependencies) {
    this.policy = { ...hermesV2Policy, ...deps.policy };
    this.secrets = new SecretRedactor(this.policy);
    this.organization = deps.organization ?? (deps.organizationOptions ? new OrganizationService(deps.organizationOptions,
      deps.dashboard, deps.authority, deps.resolveProjectCwd, {
        invalidate: (owner, session, revision) => this.publishMetadataInvalidation(owner, session, revision),
        activity: (owner, scope, sessions) => readActivity(this.managers.get(owner), scope, sessions),
        hasRequests: (scope, session) => {
          const confirmed = this.organization?.scopes.confirmed;
          return confirmed?.id === scope && [...this.managers.values()].some((manager) => {
            const record = manager.sessions.records.get(session);
            return record?.profileName === confirmed.profile && record.snapshot.requests.length > 0;
          });
        },
        projectSummary: (summary) => ({ ...summary, title: this.secrets.text(summary.title).slice(0, 200),
          preview: this.secrets.text(summary.preview).slice(0, 1000), cwd: summary.cwd === null ? null : this.secrets.text(summary.cwd).slice(0, 4096) }),
      }) : undefined);
    this.deps = deps;
    this.attachments = this.organization ? new AttachmentService(this.organization, (owner) => this.managers.get(owner),
      new CwdPolicy(deps.allowedRoots, deps.deniedRoots), (value) => this.secrets.text(value)) : undefined;
    this.resources = this.organization ? new ResourceHost(this, deps, this.organization, this.secrets) : undefined;
  }

  peek(principal: string): GatewayManager | undefined { return this.managers.get(principal); }
  existing(): readonly GatewayManager[] { return [...this.managers.values()]; }
  invalidateResources(resource: "cron" | "sessions", ids: string[] = []): void {
    for (const manager of this.managers.values()) manager.publishResourcesInvalidation(resource, ids);
    if (resource === "sessions") { this.organization?.changed(); for (const manager of this.managers.values()) manager.publishSessionsInvalidation(); }
  }

  get(principal: string): GatewayManager {
    if (this.disposed) throw new GatewayError("GATEWAY_OFFLINE", "Der Gateway wurde geschlossen.");
    clearTimeout(this.idle.get(principal));
    this.idle.delete(principal);
    let manager = this.managers.get(principal);
    if (manager) return manager;
    if (this.managers.size >= this.policy.maxManagers) {
      const evictable = [...this.managers.entries()].find(([, entry]) => entry.connections.size === 0 && !entry.retainRuntime);
      if (evictable) this.remove(evictable[0]);
      else throw new GatewayError("RATE_LIMITED", "Zu viele aktive Hermes-Verbindungen.");
    }
    manager = new GatewayManager(principal, this.deps, this.policy, this.registry, this.secrets, () => this.scheduleIdle(principal), this.organization,
      this.attachments, () => { for (const entry of this.managers.values()) entry.publishSessionsInvalidation(); });
    this.managers.set(principal, manager);
    return manager;
  }

  publishMetadataInvalidation(principal: string, sessionId: string, revision: number): void {
    this.managers.get(principal)?.publishMetadataInvalidation(sessionId, revision);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const principal of [...this.managers.keys()]) this.remove(principal);
    this.registry.dispose();
    this.resources?.dispose();
    this.secrets.clear();
    this.organization?.dispose();
  }

  private scheduleIdle(principal: string): void {
    const manager = this.managers.get(principal);
    clearTimeout(this.idle.get(principal));
    this.idle.delete(principal);
    if (!manager || manager.connections.size || manager.retainRuntime) return;
    if (manager.disposeImmediately) { this.remove(principal); return; }
    const timer = setTimeout(() => {
      if (!manager.connections.size && !manager.retainRuntime) this.remove(principal);
    }, this.policy.idleMs);
    timer.unref();
    this.idle.set(principal, timer);
  }

  private remove(principal: string): void {
    clearTimeout(this.idle.get(principal));
    this.idle.delete(principal);
    this.managers.get(principal)?.dispose();
    this.managers.delete(principal);
  }
}
