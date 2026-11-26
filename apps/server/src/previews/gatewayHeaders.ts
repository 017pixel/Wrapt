/** Header-Helfer für den Preview-Gateway (Proxy, Link- und CSP-Umschreibung). */
export type HeaderBag = Record<string, string | string[] | undefined>;

const hopByHopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/** Anfrageheader für den lokalen Devserver. */
export function proxyRequestHeaders(options: {
  headers: HeaderBag;
  targetPort: number;
  targetProtocol: "http" | "https";
  publicOrigin: string;
  upstreamOrigin?: string;
}): Record<string, string> {
  const headers: HeaderBag = { ...options.headers };
  for (const name of hopByHopHeaders) delete headers[name];
  delete headers["content-length"];
  delete headers["sec-websocket-key"];
  delete headers["sec-websocket-version"];
  headers.host = `127.0.0.1:${options.targetPort}`;
  const publicUrl = new URL(options.publicOrigin);
  headers["x-forwarded-host"] = publicUrl.host;
  headers["x-forwarded-proto"] = publicUrl.protocol.replace(":", "");
  headers["x-forwarded-port"] = publicUrl.port || (publicUrl.protocol === "https:" ? "443" : "80");
  if (options.headers.origin) {
    headers.origin = options.upstreamOrigin ?? `${options.targetProtocol}://127.0.0.1:${options.targetPort}`;
  }
  return headers as Record<string, string>;
}

function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(hostname.toLowerCase());
}

/** Schreibt genau die Ziel-URLs bekannter lokaler Dienste auf ihre Slot-Origin um. */
export function rewriteLocalUrl(value: string, mapping: Record<string, string>): string {
  try {
    const url = new URL(value);
    if (!isLoopbackHost(url.hostname)) return value;
    const replacement = mapping[url.port];
    if (!replacement) return value;
    const publicUrl = new URL(replacement);
    publicUrl.pathname = url.pathname;
    publicUrl.search = url.search;
    publicUrl.hash = url.hash;
    return publicUrl.href;
  } catch {
    return value;
  }
}

/**
 * Zerlegt einen `Link`-Header in seine Einträge, statt ihn als eine URL zu
 * behandeln. Kommas innerhalb von spitzen Klammern oder Anführungszeichen bleiben
 * dabei erhalten.
 */
export function splitLinkHeader(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inBrackets = false;
  let inQuotes = false;
  for (const character of value) {
    if (character === "<" && !inQuotes) inBrackets = true;
    else if (character === ">" && !inQuotes) inBrackets = false;
    else if (character === "\"") inQuotes = !inQuotes;
    if (character === "," && !inBrackets && !inQuotes) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function rewriteLinkHeader(value: string, mapping: Record<string, string>): string {
  return splitLinkHeader(value)
    .map((entry) => entry.replace(/^<([^>]*)>/, (_match, url: string) => `<${rewriteLocalUrl(url, mapping)}>`))
    .join(", ");
}

function parseCspDirectives(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift()?.toLowerCase();
    if (!name) continue;
    directives.set(name, tokens);
  }
  return directives;
}

function serializeCspDirectives(directives: Map<string, string[]>): string {
  return [...directives.entries()].map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

/**
 * Passt für bestätigte lokale Devserver ausschließlich die Embedding-Regel an:
 * `X-Frame-Options` entfällt und `frame-ancestors` erhält die Workbench-Origin.
 * Der restliche CSP bleibt erhalten; jede Änderung wird protokolliert.
 */
export function adjustEmbeddingPolicy(headers: HeaderBag, options: { workbenchOrigins: readonly string[]; allowBridgeScript: boolean }): {
  headers: HeaderBag;
  changes: string[];
} {
  const result: HeaderBag = { ...headers };
  const changes: string[] = [];
  if (result["x-frame-options"] !== undefined) {
    delete result["x-frame-options"];
    changes.push("X-Frame-Options entfernt");
  }
  for (const header of ["content-security-policy", "content-security-policy-report-only"]) {
    const raw = result[header];
    if (raw !== undefined && typeof raw !== "string") continue;
    // Eine erzwungene Policy wird auch dann angelegt, wenn der Upstream keine
    // CSP oder keine frame-ancestors-Direktive geliefert hat. XFO darf nie
    // entfernt werden, ohne einen gleichwertigen, engeren Ersatz zu setzen.
    if (header === "content-security-policy" && raw === undefined) {
      result[header] = `frame-ancestors ${options.workbenchOrigins.join(" ")}`;
      changes.push(`${header}: frame-ancestors für die Workbench gesetzt`);
      continue;
    }
    if (raw === undefined) continue;
    const directives = parseCspDirectives(raw);
    const ancestors = directives.get("frame-ancestors");
    if (ancestors) {
      const missing = options.workbenchOrigins.filter((origin) => !ancestors.includes(origin));
      if (missing.length > 0 || ancestors.includes("'none'")) {
        directives.set("frame-ancestors", [...ancestors.filter((entry) => entry !== "'none'"), ...missing]);
        changes.push(`${header}: frame-ancestors um die Workbench ergänzt`);
      }
    } else {
      directives.set("frame-ancestors", [...options.workbenchOrigins]);
      changes.push(`${header}: frame-ancestors für die Workbench gesetzt`);
    }
    if (options.allowBridgeScript) {
      const scriptSource = directives.get("script-src") ?? directives.get("default-src");
      if (scriptSource && !scriptSource.includes("'self'")) {
        directives.set("script-src", [...scriptSource, "'self'"]);
        changes.push(`${header}: script-src um 'self' für die Bridge ergänzt`);
      }
    }
    result[header] = serializeCspDirectives(directives);
  }
  return { headers: result, changes };
}
