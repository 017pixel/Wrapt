import type { ResourceError } from "./resource-types";

export class ResourceFailure extends Error {
  readonly info: ResourceError;
  constructor(code: string, message: string, outcome: ResourceError["outcome"] = "not_sent", status: number | null = null) {
    super(message);
    this.info = { code, message, outcome, status, retryable: false };
  }
}
export function resourceError(error: unknown, outcome: ResourceError["outcome"] = "not_sent"): ResourceError {
  return error instanceof ResourceFailure ? error.info
    : new ResourceFailure("RESOURCE_UNAVAILABLE", "Die Ressourcenantwort konnte nicht bestätigt werden.", outcome).info;
}
export function staleResource(outcome: ResourceError["outcome"] = "not_sent"): ResourceFailure {
  return new ResourceFailure("STALE_RESOURCE_CONTEXT", "Der Ressourcenbereich oder sein Kontext hat sich geändert.", outcome);
}
