import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import type { GatewayDependencies } from "../types.js";
import type { OrganizationService } from "../organization/service.js";
import { captureHomeProof } from "../home-proof.js";
import { CwdPolicy } from "../cwd-policy.js";
import { ResourceError, staleResource } from "./errors.js";

export async function resourceContext(deps: GatewayDependencies, organization: OrganizationService, active: () => boolean, expected: string | undefined) {
  const enabled = () => {
    if (!active()) throw new ResourceError(403, "FORBIDDEN", "Die Ressourcenanfrage ist nicht mehr aktiv.");
    if (!deps.enabled()) throw new ResourceError(403, "V2_DISABLED", "Hermes V2 ist deaktiviert.");
  };
  enabled();
  const freshScope = async () => {
    try { return await organization.scopes.fresh(); }
    catch { throw new ResourceError(503, "SOURCE_IDENTITY_UNKNOWN", "Der aktuelle Profil- und HOME-Kontext ist nicht bestätigt."); }
  };
  const scope = await freshScope(); enabled();
  const revision = organization.scopes.revision;
  let home: ReturnType<typeof captureHomeProof>;
  try { home = captureHomeProof(scope, organization.scopes); } catch { throw staleResource(); }
  const checkHome = () => { try { home.assert(); } catch { throw staleResource(); } };
  const assert = () => {
    enabled();
    if (organization.scopes.confirmed?.id !== scope.id || organization.scopes.revision !== revision) throw staleResource();
    checkHome();
  };
  const confirmHome = async () => { try { await home.current(); } catch { throw staleResource(); } };
  assert(); await confirmHome(); assert();
  const token = createHash("sha256").update(JSON.stringify([scope.id, revision, home.dev, home.ino, home.generation])).digest("hex");
  if (expected !== undefined && expected !== token) throw staleResource();
  const current = async () => {
    assert(); await confirmHome(); assert();
    const fresh = await freshScope(); assert();
    if (fresh.id !== scope.id) throw staleResource();
    // Kein weiterer Await zwischen frischem Profilbeleg und letzter HOME-Identitätsprüfung.
    checkHome();
  };
  const cwd = async (spelling: string) => {
    const policy = new CwdPolicy(deps.allowedRoots, deps.deniedRoots);
    let canonical: string;
    try { canonical = await policy.validate(spelling); } catch { throw new ResourceError(403, "PROJECT_FORBIDDEN", "Der Arbeitsordner ist nicht sicher erlaubt."); }
    await current();
    const original = lstatSync(canonical);
    const stableCwd = () => { try {
      const now = lstatSync(canonical);
      if (!now.isDirectory() || now.dev !== original.dev || now.ino !== original.ino || realpathSync(spelling) !== canonical) throw staleResource();
    } catch { throw staleResource(); } };
    stableCwd();
    return { canonical, current: async () => {
      assert(); const next = await policy.validate(spelling); await current();
      if (canonical !== next) throw staleResource();
      stableCwd();
    } };
  };
  await current();
  assert();
  return { scope, token, assert, current, cwd };
}
export type ResourceContext = Awaited<ReturnType<typeof resourceContext>>;
