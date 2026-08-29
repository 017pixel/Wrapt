import {
  extensionPermissionIdSchema,
  type ExtensionPermissionId,
  type ExtensionPermissionRequests,
} from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";

export interface CapabilityAuditEvent {
  extensionId: string;
  permission: ExtensionPermissionId;
  scope: Record<string, readonly string[]> | undefined;
}

type CapabilityScope = Record<string, readonly string[]> | undefined;

function scopeAllows(granted: CapabilityScope, requested: CapabilityScope): boolean {
  if (granted === undefined) return true;
  if (requested === undefined) return false;
  return Object.entries(requested).every(([key, values]) => {
    const grantedValues = granted[key];
    return grantedValues !== undefined && values.every((value) => grantedValues.includes(value));
  });
}

/**
 * Hostseitige Capability-Prüfung. Der Broker hält keine offenen Handles und
 * prüft jeden Aufruf erneut gegen den zuletzt genehmigten Grant.
 */
export class ExtensionCapabilityBroker {
  constructor(
    private readonly extensionId: string,
    private readonly grants: ExtensionPermissionRequests,
    private readonly onAudit?: (event: CapabilityAuditEvent) => void,
  ) {}

  assertAllowed(permission: string, scope?: CapabilityScope): ExtensionPermissionId {
    const parsedPermission = extensionPermissionIdSchema.safeParse(permission);
    if (!parsedPermission.success) {
      throw new AppError(403, "permissions-denied", "Die angeforderte Capability ist unbekannt.");
    }
    const grant = this.grants.find((entry) => entry.permission === parsedPermission.data);
    const grantedScope = grant !== undefined && "scope" in grant ? grant.scope as CapabilityScope : undefined;
    if (grant === undefined || !scopeAllows(grantedScope, scope)) {
      throw new AppError(403, "permissions-denied", "Die Extension besitzt keinen passenden Capability-Grant.");
    }
    this.onAudit?.({ extensionId: this.extensionId, permission: parsedPermission.data, scope });
    return parsedPermission.data;
  }

  async invoke<T>(
    permission: string,
    scope: CapabilityScope,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    this.assertAllowed(permission, scope);
    return operation();
  }
}
