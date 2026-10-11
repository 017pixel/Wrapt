import type { IncomingHttpHeaders } from "node:http";

/**
 * CSP-Merge für die HTML-Proxys T3 Code und Hermes-Dashboard (S-007).
 *
 * Beide Upstreams brauchen Inline-Scripts (T3-Theme-Bootstrap, Hermes-Session-
 * Token) und laufen per Pfad-Proxy in der Workbench-Origin. Eine strikte
 * `script-src 'self'`-Policy würde beide Flächen brechen — das wurde gegen die
 * Live-Upstreams verifiziert. Deshalb mergt der Proxy, statt zu entfernen:
 *
 * - Eine vorhandene Upstream-CSP bleibt vollständig erhalten (früher wurde sie
 *   ersatzlos gestrippt). Es wird nur ergänzt, nie geschwächt.
 * - Fehlen Einbettungs-Regeln, setzt der Proxy enge Defaults: `frame-ancestors
 *   'self'` (nur die Workbench darf einbetten), `object-src 'none'`,
 *   `base-uri 'self'`.
 * - `script-src` wird bewusst nicht angefasst: Solange Upstream-JS inline
 *   läuft, kann der Pfad-Proxy XSS im Upstream nicht containen. Echte Trennung
 *   verlangt eine eigene Origin (Subdomain/Port) — siehe Doku `docs/`.
 *
 * Der Merge ist damit ein kleiner, reversibler Schritt; kein Ersatz für
 * Origin-Trennung oder Nightly-Pinning.
 */

export interface ProxyCspMerge {
  headers: IncomingHttpHeaders;
  /** Lesbare Liste der Ergänzungen, für Diagnose und Tests. */
  changes: string[];
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
 * Ergänzt die Upstream-CSP um Einbettungs-Härtung, ohne je eine Direktive zu
 * entfernen oder zu lockern. Ohne Upstream-CSP entsteht eine Minimal-Policy.
 */
export function mergeProxyContentSecurityPolicy(
  headers: IncomingHttpHeaders,
): ProxyCspMerge {
  const result: IncomingHttpHeaders = { ...headers };
  const raw = result["content-security-policy"];
  // Mehrere CSP-Header wirken UND-verknüpft; Zusammenführen würde die Semantik
  // ändern. In dem Fall (und bei Nicht-String) bleibt der Upstream unangetastet.
  if (raw !== undefined && typeof raw !== "string") return { headers: result, changes: [] };
  const directives = raw === undefined ? new Map<string, string[]>() : parseCspDirectives(raw);
  const changes: string[] = [];

  const ancestors = directives.get("frame-ancestors");
  if (!ancestors) {
    directives.set("frame-ancestors", ["'self'"]);
    changes.push("frame-ancestors 'self' gesetzt");
  } else if (ancestors.includes("'none'")) {
    directives.set("frame-ancestors", ["'self'"]);
    changes.push("frame-ancestors 'none' durch 'self' ersetzt");
  }
  if (!directives.has("object-src")) {
    directives.set("object-src", ["'none'"]);
    changes.push("object-src 'none' gesetzt");
  }
  if (!directives.has("base-uri")) {
    directives.set("base-uri", ["'self'"]);
    changes.push("base-uri 'self' gesetzt");
  }

  result["content-security-policy"] = serializeCspDirectives(directives);
  return { headers: result, changes };
}
