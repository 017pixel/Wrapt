import { hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { redactHistoryOutput } from "./history-output-redaction.js";
import { errorMessage, protocolError } from "./errors.js";
import type { BrowserConnection } from "./types.js";
import type { SecretRedactor } from "./secret-redactor.js";
import { projectComposer } from "./composer-projection.js";
import { hermesV2Policy } from "./policy.js";
import { boundWorkRoster } from "./work/output-budget.js";
import { credentialRanges } from "./redaction-ranges.js";
import { text } from "./normalize-values.js";
import { boundHistoryOutput } from "./history-output-budget.js";

/** Der letzte Ausgabepfad hält Maskierung und Protokollprüfung zusammen. */
export function sendBrowserMessage(connection: BrowserConnection, original: HermesV2ServerMessage, secrets: SecretRedactor, streamScope: string,
  project: (message: HermesV2ServerMessage) => HermesV2ServerMessage = (message) => message, browserBytes: number = hermesV2Policy.browserBytes, rawStream?: string): void {
  let message = projectComposer(connection, project(original));
  if (!connection.resources && message.type === "event" && message.event.type === "resources.invalidated") return;
  if (!connection.work && message.type === "event" && (message.event.type === "work.updated" || message.event.type === "work.invalidated")) return;
  if (message.type === "event") {
    const event = message.event;
    const sessionChannel = `${streamScope}${encodeURIComponent(connection.id)}:${encodeURIComponent(JSON.stringify(event.sessionId))}:`;
    if (event.type === "message.delta" || event.type === "reasoning.delta") {
      const channel = `${sessionChannel}${encodeURIComponent(event.payload.turnId)}:${event.type}`;
      message = { ...message, event: { ...event, payload: { ...event.payload, text: text(secrets.stream(channel, rawStream ?? event.payload.text, credentialRanges)) } } };
    } else if (event.type === "message.started") {
      secrets.finish(sessionChannel);
    } else if (event.type === "message.completed") {
      secrets.finish(`${sessionChannel}${encodeURIComponent(event.payload.turnId)}:`);
    }
  }
  message = redactHistoryOutput(message, secrets);
  message = boundHistoryOutput(message);
  if (message.type === "result" && message.op === "work.read") {
    const wrapperBytes = Buffer.byteLength(JSON.stringify({ ...message, data: null })) - 4;
    message = { ...message, data: boundWorkRoster(message.data, browserBytes - wrapperBytes) };
  }
  const parsed = hermesV2ServerMessageSchema.safeParse(message);
  if (parsed.success) connection.send(parsed.data);
  else connection.send(errorMessage(protocolError(), null));
}
