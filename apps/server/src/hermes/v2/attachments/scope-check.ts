import type { OrganizationScope } from "../organization/scope.js";
import { GatewayError } from "../errors.js";
import { captureHomeProof, requireCanonicalHome } from "../home-proof.js";

const staleHome = () => new GatewayError("STALE_REQUEST", "Der bestätigte Hermes-Home-Kontext hat sich geändert.");

export function captureAttachmentHome(scope: OrganizationScope, owner: object) {
  try {
    const proof = captureHomeProof(scope, owner);
    return { assert: () => { try { proof.assert(); } catch { throw staleHome(); } } };
  } catch { throw staleHome(); }
}

/** Ein bestätigter kanonischer HOME-Pfad darf nicht auf ein neues Ziel umgebunden werden. */
export async function requireAttachmentHome(scope: OrganizationScope): Promise<void> {
  try { await requireCanonicalHome(scope); } catch { throw staleHome(); }
}
