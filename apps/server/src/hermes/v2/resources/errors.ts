import type { HermesV2ResourceError } from "@wrapt/contracts/hermes-v2";

export class ResourceError extends Error {
  constructor(readonly status: number, readonly code: HermesV2ResourceError["code"], message: string,
    readonly outcome: HermesV2ResourceError["outcome"] = "not_sent") { super(message); }
}
export const staleResource = () => new ResourceError(409, "STALE_RESOURCE_CONTEXT", "Der Profil- oder Ressourcenbeleg hat sich geändert. Bitte neu lesen.");
export function upstreamResource(error: unknown): ResourceError {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null;
  if (status === 404) return new ResourceError(404, "TARGET_UNAVAILABLE", "Die native Ressource ist nicht mehr vorhanden.", "rejected");
  if (status === 409) return new ResourceError(409, "NATIVE_CONFLICT", "Die native Ressource ist momentan geschützt oder bereits in Ausführung.", "rejected");
  if (status === 424) return new ResourceError(503, "UNKNOWN_OUTCOME", "Der Job könnte gespeichert sein, aber seine Scheduler-Registrierung ist fehlgeschlagen. Bitte vor einem neuen Versuch neu lesen.", "unknown");
  if (status !== null && status >= 400 && status < 500) return new ResourceError(status, "UPSTREAM_REJECTED", "Hermes hat die Anfrage abgewiesen.", "rejected");
  return new ResourceError(503, "RESOURCE_UNAVAILABLE", "Die native Ressource ist momentan nicht sicher erreichbar.");
}
