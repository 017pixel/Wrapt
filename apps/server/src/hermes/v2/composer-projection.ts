import type { HermesV2ServerMessage, HermesV2Snapshot, HermesV2Message } from "@wrapt/contracts/hermes-v2";
import type { BrowserConnection } from "./types.js";

export function projectComposer(connection: BrowserConnection, original: HermesV2ServerMessage): HermesV2ServerMessage {
  if (connection.composer) return original.type === "connection" ? { ...original, connectionId: connection.id } : original;
  const row = (message: HermesV2Message) => { const copy = { ...message }; delete copy.attachments; return copy; };
  const snapshot = (value: HermesV2Snapshot) => { const copy = { ...value, messages: value.messages.map(row) }; delete copy.composer; return copy; };
  if (original.type === "connection") { const copy = { ...original }; delete copy.connectionId; return copy; }
  if (original.type === "snapshot") return { ...original, snapshot: snapshot(original.snapshot) };
  if (original.type === "event" && original.event.type === "session.updated") {
    const payload = { ...original.event.payload }; delete payload.composer;
    return { ...original, event: { ...original.event, payload } };
  }
  if (original.type === "result") {
    if (original.op === "session.create" || original.op === "session.subscribe") return { ...original, data: { snapshot: snapshot(original.data.snapshot) } };
    if (original.op === "history.read") return { ...original, data: { ...original.data, messages: original.data.messages.map(row) } };
    if (original.op === "catalog.read") {
      return { ...original, data: { commands: original.data.commands.map((value) => {
        const copy = { ...value, argumentHint: null }; delete copy.aliases; delete copy.argumentMode; delete copy.subcommands; delete copy.desktopSubcommands; return copy;
      }), models: { ...original.data.models, providers: original.data.models.providers.map((provider) => ({ ...provider, models: provider.models.map((value) => {
        const copy = { ...value }; delete copy.reportedReasoning; delete copy.canDisableReasoning; return copy;
      }) })) } } };
    }
  }
  return original;
}
