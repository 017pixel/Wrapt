import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { z } from "zod";
import type { DashboardReader } from "../types.js";
import { OrganizationError } from "./errors.js";

export interface OrganizationScope { id: string; profile: string; home: string }
export class ScopeResolver {
  private value: OrganizationScope | null = null;
  private pending: Promise<OrganizationScope> | null = null;
  private lastIdentity: string | null = null;
  private observationRevision = 0;
  private lastProfile: string | null = null;
  constructor(private dashboard: DashboardReader, private authority: string, private configuredHome: string) {}
  get confirmed(): OrganizationScope | null { return this.value; }
  get revision(): number { return this.observationRevision; }
  invalidate(): void { this.value = null; }
  current(): Promise<OrganizationScope> {
    if (this.value) return Promise.resolve(this.value);
    this.pending ??= this.resolve().finally(() => { this.pending = null; });
    return this.pending;
  }
  async fresh(): Promise<OrganizationScope> {
    try { return await this.resolve(); }
    catch (error) { this.observationRevision++; this.value = null; throw error; }
  }
  private observe(profile: string): void {
    if (this.lastProfile !== null && this.lastProfile !== profile) { this.observationRevision++; this.value = null; }
    this.lastProfile = profile;
  }
  private async resolve(): Promise<OrganizationScope> {
    const current = z.object({ current: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/) }).parse(await this.dashboard.get("/api/profiles/active")).current;
    this.observe(current);
    if (current === "custom") throw new OrganizationError(503, "SOURCE_IDENTITY_UNKNOWN", "Das Dashboard-Profil ist nicht eindeutig bestätigt.");
    const profiles = z.object({ profiles: z.array(z.object({ name: z.string(), path: z.string() })).max(1000) }).parse(await this.dashboard.get("/api/profiles"));
    const matches = profiles.profiles.filter((profile) => profile.name === current);
    if (matches.length !== 1 || !isAbsolute(matches[0]!.path)) throw new OrganizationError(503, "SOURCE_IDENTITY_UNKNOWN", "Der Profilkontext ist nicht bestätigt.");
    const [home, configured] = await Promise.all([realpath(matches[0]!.path), realpath(this.configuredHome)]);
    const child = relative(configured, home);
    if (child && (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`))) throw new OrganizationError(503, "SOURCE_IDENTITY_UNKNOWN", "Das Dashboard verwendet einen anderen Home-Kontext.");
    const checked = z.object({ current: z.string() }).parse(await this.dashboard.get("/api/profiles/active"));
    this.observe(checked.current);
    if (checked.current !== current) throw new OrganizationError(503, "SOURCE_IDENTITY_UNKNOWN", "Die Dashboardbindung hat sich während des Abgleichs geändert.");
    const id = createHash("sha256").update(JSON.stringify([this.authority, configured, current, home])).digest("hex");
    if (this.lastIdentity !== id) { this.observationRevision++; this.lastIdentity = id; }
    this.value = { id, profile: current, home };
    return this.value;
  }
}
