const assetIdPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const linkStart = "(?:!?\\[[^\\]\\r\\n]*\\]\\(\\s*<?|^\\s{0,3}\\[[^\\]\\r\\n]+\\]:\\s*<?)";
const legacyMediaLink = new RegExp(
  `(${linkStart}(?:https?:\\/\\/[^/\\s<>()]+)?)\\/api\\/v1\\/orbit\\/assets\\/(${assetIdPattern})(?=[/?#\\s)>]|$)`,
  "gmi",
);

/** Nur die Lesefassung historischer Markdown-Medienlinks wird normalisiert. */
export function normalizeLegacyMediaLinks(content: string): string {
  return content.replace(legacyMediaLink, "$1/api/v1/media/$2");
}
