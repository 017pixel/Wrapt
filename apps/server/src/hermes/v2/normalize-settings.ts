import type { HermesV2ComposerSettings } from "@wrapt/contracts/hermes-v2";
import { object } from "./normalize-values.js";

export function normalizeComposerSettings(value: unknown): HermesV2ComposerSettings {
  const raw = object(value);
  const effort = (key: string) => typeof raw[key] === "string" && raw[key] ? String(raw[key]).slice(0, 40) : null;
  const mode = raw.approval_mode === "manual" || raw.approval_mode === "smart" || raw.approval_mode === "off" ? raw.approval_mode : null;
  return { reasoning: { effort: effort("reasoning_effort"), wire: effort("reasoning_effort_wire") },
    approvals: { mode, effectiveBypass: mode === "off" || raw.yolo === true ? true : typeof raw.yolo === "boolean" ? raw.yolo : null,
      scope: "global", editable: mode !== null,
      options: (["manual", "smart", "off"] as const).map((option) => ({ mode: option, available: mode !== null })) } };
}
