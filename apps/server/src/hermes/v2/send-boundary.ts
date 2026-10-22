import { Socket } from "node:net";
import { WebSocket } from "ws";
import { GatewayError } from "./errors.js";

export function serializeFrame(frame: object): string {
  try { return JSON.stringify(frame); }
  catch { throw new GatewayError("INVALID_MESSAGE", "Die Hermes-Anfrage konnte nicht serialisiert werden."); }
}

/** ws 8: Sender kann nach dem ersten Teilframe synchron werfen. Nur beweisbare Vorsendfehler freigeben. */
export function sendFrame(socket: WebSocket, frame: string, mutation: boolean, onWritten?: (error?: Error) => void): void {
  if (socket.readyState !== WebSocket.OPEN) throw new GatewayError("GATEWAY_OFFLINE", "Der Hermes-Gateway ist nicht verbunden.", "not_sent", true);
  const rawSocket: unknown = Reflect.get(socket, "_socket");
  const transport = rawSocket instanceof Socket ? rawSocket : null;
  const written = transport?.bytesWritten;
  const buffered = socket.bufferedAmount;
  let callbackObserved = false;
  let callbackError = false;
  try {
    socket.send(frame, (error) => {
      callbackObserved = true;
      if (error) callbackError = true;
      onWritten?.(error);
    });
  } catch {
    const possiblyAccepted = callbackObserved || written === undefined || transport?.bytesWritten !== written || socket.bufferedAmount !== buffered;
    throw new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Verbindung wurde unterbrochen.", mutation && possiblyAccepted ? "unknown" : "not_sent", true);
  }
  // Callbackfehler können auch synchron von einer bereits angenommenen Sendung kommen.
  if (callbackError) throw new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Verbindung wurde unterbrochen.", mutation ? "unknown" : "not_sent", true);
}
