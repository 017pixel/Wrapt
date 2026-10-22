import type { HermesV2ErrorCode, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";

export class GatewayError extends Error {
  constructor(
    readonly code: HermesV2ErrorCode,
    message: string,
    readonly outcome: "not_sent" | "unknown" = "not_sent",
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function protocolError(outcome: "not_sent" | "unknown" = "not_sent"): GatewayError {
  return new GatewayError("PROTOCOL_MISMATCH", "Der Hermes-Gateway-Vertrag passt nicht zu dieser Oberfläche.", outcome);
}

export function errorMessage(error: unknown, id: string | null): HermesV2ServerMessage {
  const known = error instanceof GatewayError ? error : null;
  return {
    v: 1, type: "error", id, code: known?.code ?? "OPERATION_FAILED",
    message: known?.message ?? "Die Hermes-Anfrage konnte nicht verarbeitet werden.",
    outcome: known?.outcome ?? "not_sent", retryable: known?.retryable ?? false,
  };
}
