import type { OrganizationService } from "./organization/service.js";
import type { OrganizationScope } from "./organization/scope.js";
import { requireAttachmentHome } from "./attachments/scope-check.js";

/** Inhaltsfreier Quellkontext derselben Historylesung, gemeinsam für beide Projektionen. */
export interface HistoryContext {
  readonly scope: Readonly<OrganizationScope>;
  valid(): boolean;
  current(): Promise<boolean>;
}
export function captureHistoryContext(organization: OrganizationService | undefined): HistoryContext | null {
  const observed = organization?.scopes.confirmed;
  if (!organization || !observed) return null;
  const scope = Object.freeze({ ...observed });
  const revision = organization.scopes.revision;
  const valid = () => {
    const current = organization.scopes.confirmed;
    return current?.id === scope.id && current.profile === scope.profile && current.home === scope.home
      && organization.scopes.revision === revision;
  };
  return { scope, valid, current: async () => {
    if (!valid()) return false;
    try { await requireAttachmentHome(scope); } catch { return false; }
    return valid();
  } };
}
