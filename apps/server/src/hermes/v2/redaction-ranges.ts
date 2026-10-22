import { isSensitiveKey, textRedactionPatterns } from "../redaction.js";
import type { RedactionRange } from "./secret-redactor.js";

function stringEnd(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === "\\") { index++; continue; }
    if (source[index] === '"') return index + 1;
  }
  return source.length;
}
function whitespace(source: string, start: number): number {
  while (start < source.length && /\s/u.test(source[start]!)) start++;
  return start;
}
function valueEnd(source: string, start: number): number {
  if (source[start] === '"') return stringEnd(source, start);
  if (source[start] !== "{" && source[start] !== "[") {
    let end = start;
    while (end < source.length && !/[\s,\]}]/u.test(source[end]!)) end++;
    return end;
  }
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '"') { index = stringEnd(source, index) - 1; continue; }
    if (char === "{" || char === "[") depth++;
    if ((char === "}" || char === "]") && --depth === 0) return index + 1;
  }
  return source.length;
}
/** Vorhandene statische Textmuster vor dynamischen Ersetzungen klassifizieren. */
function textRanges(source: string): RedactionRange[] {
  const ranges: RedactionRange[] = [];
  const patterns = [textRedactionPatterns.assignment, textRedactionPatterns.authorization, textRedactionPatterns.query];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length - match[2]!.length;
    ranges.push({ start, end: start + match[2]!.length });
  }
  for (const match of source.matchAll(textRedactionPatterns.token))
    ranges.push({ start: match.index, end: match.index + match[0].length });
  return ranges;
}
/** Schlüssel am unveränderten Rohtext erkennen; auch ein gekürzter Wert bleibt geschützt.
 * Iterativ, ohne neue Secretregistry und ohne Rekursion über untrusted Verschachtelung. */
export function credentialRanges(source: string): RedactionRange[] {
  const ranges = textRanges(source);
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '"') continue;
    const end = stringEnd(source, index); const colon = whitespace(source, end);
    if (source[colon] === ":") {
      let key: unknown;
      try { key = JSON.parse(source.slice(index, end)); } catch { /* Unvollständiger Schlüssel enthält noch keinen belegten Wert. */ }
      if (typeof key === "string" && isSensitiveKey(key)) {
        const start = whitespace(source, colon + 1); const stop = valueEnd(source, start);
        if (stop > start) ranges.push({ start, end: stop, jsonValue: true });
        index = Math.max(end, stop) - 1; continue;
      }
    }
    index = end - 1;
  }
  return ranges;
}
