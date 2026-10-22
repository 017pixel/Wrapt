import type { HermesV2Message, HermesV2ServerMessage, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import type { SecretRedactor } from "./secret-redactor.js";
import { redactBrowserMessage } from "./redact-browser.js";
import { historyText } from "./history-output-text.js";

/** Historyfelder separat mit ihren tatsächlichen Feldgrenzen maskieren, ohne Vorabverlust. */
export function redactHistoryOutput(original: HermesV2ServerMessage, secrets: SecretRedactor): HermesV2ServerMessage {
  const row = (value: HermesV2Message): HermesV2Message => {
    const nullable = (value: string | null, maximum: number) => value === null ? null : historyText(value, maximum, secrets);
    const result = { ...value, text: historyText(value.text, 200_000, secrets), reasoning: nullable(value.reasoning, 200_000),
      input: nullable(value.input, 65_536), toolName: nullable(value.toolName, 200),
      ...(value.attachments ? { attachments: value.attachments.map((file) => ({ ...file,
        name: secrets.boundedText(file.name, Math.max(file.name.length, 3)).slice(0, 200),
        mime: secrets.boundedText(file.mime, Math.max(file.mime.length, 3)).slice(0, 100) })) } : {}) };
    if ("readEvidence" in result && (result.text !== value.text || result.reasoning !== value.reasoning || result.input !== value.input)) result.readEvidence = null;
    return result;
  };
  const snapshot = (source: HermesV2Snapshot, redacted: HermesV2Snapshot): HermesV2Snapshot => {
    const nullable = (value: string | null) => value === null ? null : historyText(value, 200_000, secrets);
    return { ...redacted, messages: source.messages.map(row), queuedText: nullable(source.queuedText),
      inflight: source.inflight ? { ...source.inflight,
        user: historyText(source.inflight.user, 200_000, secrets), assistant: historyText(source.inflight.assistant, 200_000, secrets),
        displayText: nullable(source.inflight.displayText), corrections: source.inflight.corrections.map((value) => historyText(value, 200_000, secrets)),
        error: source.inflight.error === null ? null : secrets.boundedText(source.inflight.error, Math.max(source.inflight.error.length, 3)),
      } : null };
  };
  if (original.type === "result" && original.op === "history.read")
    return { ...original, data: { ...original.data, messages: original.data.messages.map(row) } };
  if (original.type === "snapshot") {
    const metadata = redactBrowserMessage({ ...original, snapshot: { ...original.snapshot, messages: [], inflight: null, queuedText: null } }, secrets);
    if (metadata.type === "snapshot") return { ...metadata, snapshot: snapshot(original.snapshot, metadata.snapshot) };
  }
  if (original.type === "result" && (original.op === "session.subscribe" || original.op === "session.create")) {
    const metadata = redactBrowserMessage({ ...original, data: { snapshot: { ...original.data.snapshot, messages: [], inflight: null, queuedText: null } } }, secrets);
    if (metadata.type === "result" && (metadata.op === "session.subscribe" || metadata.op === "session.create"))
      return { ...metadata, data: { snapshot: snapshot(original.data.snapshot, metadata.data.snapshot) } };
  }
  return redactBrowserMessage(original, secrets);
}
