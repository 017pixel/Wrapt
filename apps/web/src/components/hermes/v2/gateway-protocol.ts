import type { HermesV2ClientMessage, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import type { ChatErrorInfo, SendOutcome } from "./chat-types";

type StripEnvelope<T> = T extends { v: 1; id: string } ? Omit<T, "v" | "id"> : never;
export type GatewayOperation = StripEnvelope<HermesV2ClientMessage>;
export type GatewayResult = Extract<HermesV2ServerMessage, { type: "result" }>;
export type OperationResult<O extends GatewayOperation["op"]> = Extract<GatewayResult, { op: O }>;
export interface GatewaySocket {
  readonly readyState: number;
  readonly bufferedAmount?: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
export class ChatError extends Error implements ChatErrorInfo {
  constructor(readonly code: string, message: string, readonly outcome: SendOutcome = "not_sent") {
    super(message);
    this.name = "ChatError";
  }
}
export function errorInfo(error: unknown): ChatErrorInfo {
  return error instanceof ChatError
    ? { code: error.code, message: error.message, outcome: error.outcome }
    : { code: "CLIENT_ERROR", message: "Die Hermes-Aktion konnte nicht ausgeführt werden.", outcome: "not_sent" };
}
export function isMutation(op: GatewayOperation["op"]): boolean {
  return !["sessions.list", "session.subscribe", "session.unsubscribe", "history.read", "catalog.read", "subagents.read", "work.read", "work.subagent.tail"].includes(op);
}
export function isPriority(op: GatewayOperation["op"]): boolean {
  return ["session.stop", "request.respond", "request.lock"].includes(op);
}
