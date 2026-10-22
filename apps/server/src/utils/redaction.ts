const SENSITIVE_KEY_PATTERN = /key|token|secret|password|authorization|credential/i;
export const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY_PATTERN.test(key);
/** Gemeinsame Matcher für statische Redaction und Schutzintervalle am Rohtext. */
export const textRedactionPatterns = {
  assignment: /((?:api[-_ ]?key|token|secret|password|authorization)\s*[:=]\s*)([^\s,;]+)/gi,
  authorization: /\b(Bearer|Basic)\s+([A-Za-z0-9._~+/=-]+)/gi,
  query: /([?&](?:token|key|secret)=)([^&#\s]+)/gi,
  token: /\b(?:sk|ghp|gho|github_pat)-?[A-Za-z0-9_-]{16,}\b/g,
};

function redactRawText(value: string): string {
  return value.replace(textRedactionPatterns.assignment, "$1***")
    .replace(textRedactionPatterns.authorization, "$1 ***")
    .replace(textRedactionPatterns.query, "$1***")
    .replace(textRedactionPatterns.token, "***");
}

/**
 * Entfernt sensible Werte aus Daten, bevor Hermes-Antworten weitergereicht
 * oder in Diagnosezustände übernommen werden. Die Funktion ist absichtlich
 * rein und kennt keine Hermes-spezifischen Datenmodelle.
 */
export function redactSensitive(value: unknown, key?: string, depth = 0): unknown {
  if (key && isSensitiveKey(key)) return "***";
  if (depth > 12) return "[gekürzt]";
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, undefined, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactSensitive(childValue, childKey, depth + 1);
    }
    return result;
  }
  return typeof value === "string" ? redactRawText(value) : value;
}

export function redactText(value: string, maximumLength = 8_192): string {
  const trimmed = value.length > maximumLength ? `${value.slice(0, maximumLength)}\n[gekürzt]` : value;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" ? JSON.stringify(redactSensitive(parsed)) ?? trimmed : redactRawText(trimmed);
  } catch {
    return redactRawText(trimmed);
  }
}

export function truncateText(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(redactSensitive(value)) ?? String(value);
  return text.length > maximumLength ? `${text.slice(0, maximumLength)}\n[gekürzt]` : text;
}
