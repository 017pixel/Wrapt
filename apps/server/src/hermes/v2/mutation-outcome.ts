import { GatewayError } from "./errors.js";
import type { GatewayUpstream, UpstreamMethod } from "./upstream.js";

/** Pro Browseroperation: ein späterer Lesefehler kann einen möglichen Send nicht rückgängig machen. */
export class MutationOutcome {
  private possiblySent = false;

  async call(upstream: GatewayUpstream, method: UpstreamMethod, params: Record<string, unknown>): Promise<unknown> {
    try {
      const value = await upstream.call(method, params, true);
      this.possiblySent = true;
      return value;
    } catch (error) {
      if (!(error instanceof GatewayError) || error.outcome === "unknown") this.possiblySent = true;
      throw this.error(error);
    }
  }

  async respond(upstream: GatewayUpstream, id: string, result: Record<string, unknown>): Promise<void> {
    try {
      await upstream.respond(id, result);
      this.possiblySent = true;
    } catch (error) {
      if (!(error instanceof GatewayError) || error.outcome === "unknown") this.possiblySent = true;
      throw this.error(error);
    }
  }

  error(error: unknown): GatewayError {
    const known = error instanceof GatewayError ? error : null;
    return new GatewayError(known?.code ?? "OPERATION_FAILED", known?.message ?? "Die Hermes-Anfrage konnte nicht verarbeitet werden.",
      this.possiblySent ? "unknown" : known?.outcome ?? "not_sent", known?.retryable ?? false);
  }
}
