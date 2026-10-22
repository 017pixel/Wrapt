import { hermesV2IdSchema, type HermesV2Message } from "@wrapt/contracts/hermes-v2";
import { jsonText, object, text } from "./normalize-values.js";
import type { UpstreamEvent } from "./types.js";
import type { SecretRedactor } from "./secret-redactor.js";

interface ReplayScope { epoch: string; liveId: string; running?: boolean | null }

/** Replay kennt keine SQLite-Vorkommens-UIDs: History niemals anhand einer Provider-ID überschreiben. */
export function withReplayTools(history: HermesV2Message[], events: readonly UpstreamEvent[], scope: ReplayScope, secrets?: SecretRedactor): HermesV2Message[] {
  if (scope.running === false) return history;
  const replay: HermesV2Message[] = [];
  const open = new Map<string, number[]>();
  let turn = 0;
  for (const [position, event] of events.entries()) {
    if (event.type === "message.start" || event.type === "message.complete") {
      replay.length = 0;
      open.clear();
      turn = event.seq ?? position;
      continue;
    }
    if (event.type !== "tool.start" && event.type !== "tool.complete") continue;
    const payload = object(event.payload);
    const id = hermesV2IdSchema.safeParse(payload.tool_id);
    if (!id.success) continue;
    const candidates = open.get(id.data) ?? [];
    if (event.type === "tool.complete") {
      if (candidates.length !== 1) {
        for (const slot of candidates) replay[slot]!.toolStatus = "unknown";
        open.delete(id.data);
        continue;
      }
      const previous = replay[candidates[0]!]!;
      previous.text = jsonText(payload.result_text ?? payload.result ?? payload.summary ?? "", 65_536, secrets);
      previous.toolStatus = "complete";
      open.delete(id.data);
      continue;
    }
    const hash = createHash("sha256").update(JSON.stringify([scope.epoch, scope.liveId, turn, event.seq ?? position])).digest("hex");
    const key = `tool:replay:${hash}`;
    if (replay.some((entry) => entry.id === key)) continue;
    open.set(id.data, [...candidates, replay.length]);
    replay.push({
      id: key, rowId: null, logicalId: null, role: "tool", reasoning: null, timestamp: null,
      toolId: id.data, toolName: text(payload.name, 200, secrets), toolStatus: "running",
      input: payload.args !== undefined ? jsonText(payload.args, 65_536, secrets) : null,
      text: "", displayKind: null,
    });
  }
  return [...history, ...replay].slice(-200);
}
import { createHash } from "node:crypto";
