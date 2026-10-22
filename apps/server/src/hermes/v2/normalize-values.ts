import { redactSensitive, redactText, textRedactionPatterns } from "../redaction.js";
import type { SecretRedactor } from "./secret-redactor.js";
import { credentialRanges } from "./redaction-ranges.js";

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function text(value: unknown, maximum = 200_000, secrets?: SecretRedactor): string {
  if (typeof value !== "string") return "";
  if (secrets) return protectedText(value, secrets, maximum).text;
  const authorization = value.replace(textRedactionPatterns.authorization, "$1 ***");
  return redactText(authorization, maximum)
    .replace(textRedactionPatterns.token, "***")
    .replace(textRedactionPatterns.query, "$1***")
    .slice(0, maximum);
}
export function nullableText(value: unknown, maximum = 200_000, secrets?: SecretRedactor): string | null {
  return typeof value === "string" ? text(value, maximum, secrets) : null;
}
export function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
export function timestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value < 10_000_000_000 ? value * 1_000 : value;
}
/** Originale statische Belege und dynamische Rawtreffer vor jeder Kürzung vereinen. */
export function protectedText(value: string, secrets: SecretRedactor, maximum: number, bytes = false) {
  const full = secrets.bounded(value, Number.MAX_SAFE_INTEGER, false, credentialRanges(value)).text;
  return secrets.bounded(text(full, Number.MAX_SAFE_INTEGER), maximum, bytes);
}
export function jsonText(value: unknown, maximum = 65_536, secrets?: SecretRedactor): string {
  if (typeof value === "string") return secrets ? protectedText(value, secrets, maximum).text : text(value, maximum);
  try {
    if (!secrets) return text(JSON.stringify(redactSensitive(value)), maximum);
    const raw = JSON.stringify(value); if (raw === undefined) return "";
    const protectedRaw = protectedText(raw, secrets, Number.MAX_SAFE_INTEGER).text;
    let parsed: unknown;
    try { parsed = JSON.parse(protectedRaw); }
    catch { return "***".slice(0, Math.max(0, maximum)); } // Vereinigung über Strukturgrenzen konservativ unterdrücken.
    // Erst nach Originalklassifikation auch verschachtelte JSONstring-Echos behandeln.
    return protectedText(JSON.stringify(secrets.scrub(parsed)), secrets, maximum).text;
  }
  catch { return "[Ausgabe nicht darstellbar]"; }
}
