import type { HermesV2WorkPatch, HermesV2WorkRoster, HermesV2WorkProcess } from "@wrapt/contracts/hermes-v2";
import type { SecretRedactor } from "../secret-redactor.js";
import { boundedOutputResult } from "./normalize.js";

/** Routingidentitäten bleiben exakt; ausschließlich ausgewiesene Anzeigefelder maskieren. */
export function redactWork<T extends HermesV2WorkPatch | HermesV2WorkProcess>(value: T, secrets: SecretRedactor, onTruncated = () => {}): T {
  const copy = { ...value };
  for (const [key, limit] of [["goal", 10_000], ["model", 200], ["lastTool", 200], ["error", 4_000],
    ["text", 200_000], ["command", 4_000], ["output", 16_384]] as const) {
    const entry = Reflect.get(value, key);
    if (typeof entry === "string") {
      const result = key === "output" || key === "text" ? boundedOutputResult(entry, secrets) : secrets.bounded(entry, limit);
      if (result.truncated) onTruncated();
      Object.assign(copy, { [key]: result.text });
    }
  }
  return copy;
}
export function redactWorkRoster(value: HermesV2WorkRoster, secrets: SecretRedactor): HermesV2WorkRoster {
  const queue = value.queuedText === null ? null : secrets.bounded(value.queuedText, 200_000);
  let truncated = value.coverage.truncated || queue?.truncated === true;
  const row = <T extends HermesV2WorkPatch | HermesV2WorkProcess>(entry: T) => redactWork(entry, secrets, () => { truncated = true; });
  return { ...value, subagents: value.subagents.map(row), delegations: value.delegations.map(row), processes: value.processes.map(row),
    tasks: value.tasks.map(row), queuedText: queue?.text ?? null, coverage: { ...value.coverage, truncated } };
}
