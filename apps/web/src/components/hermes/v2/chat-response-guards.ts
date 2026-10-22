import type { HermesV2Event } from "@wrapt/contracts/hermes-v2";
import { ChatError, type GatewayOperation, type GatewayResult } from "./gateway-protocol";

/** Der Server projiziert Core-Aliase auf die angeforderte Stored-ID zurück. */
export function assertResultSession(operation: GatewayOperation, result: GatewayResult): void {
  if (!("sessionId" in operation)) return;
  const sessionId = result.op === "session.subscribe" ? result.data.snapshot.session.id
    : result.op === "history.read" ? result.data.sessionId : operation.sessionId;
  if (sessionId !== operation.sessionId) {
    throw new ChatError("PROTOCOL_MISMATCH", "Die Hermes-Antwort gehört nicht zur angeforderten Sitzung.");
  }
}
/** Auch die Metadaten eines sequenzierten Events müssen zur äußeren Session gehören. */
export function assertEventSession(event: HermesV2Event): void {
  if (event.type === "session.updated" && event.payload.session.id !== event.sessionId) {
    throw new ChatError("PROTOCOL_MISMATCH", "Die Hermes-Metadaten gehören nicht zur angegebenen Sitzung.");
  }
}
