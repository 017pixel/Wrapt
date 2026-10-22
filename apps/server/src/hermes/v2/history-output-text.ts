import type { SecretRedactor } from "./secret-redactor.js";
import { protectedText, text } from "./normalize-values.js";

export const historyTruncationNotice = "\n[Ausgabe wegen Empfangsbudget gekürzt]";

/** Rawbelege vor Maskierung schützen, danach Feldverlust im sichtbaren Text benennen. */
export function historyText(value: unknown, maximum: number, secrets?: SecretRedactor): string {
  if (typeof value !== "string") return "";
  let output: { text: string; truncated: boolean };
  if (secrets) output = protectedText(value, secrets, maximum);
  else {
    const full = text(value, Number.MAX_SAFE_INTEGER);
    output = { text: full.slice(0, maximum), truncated: full.length > maximum };
  }
  return output.truncated
    ? output.text.slice(0, Math.max(0, maximum - historyTruncationNotice.length)).replace(/[\uD800-\uDBFF]$/u, "") + historyTruncationNotice
    : output.text;
}
