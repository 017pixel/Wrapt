import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import replyFrom from "@fastify/reply-from";
import WebSocket from "ws";
import { settings } from "../config/settings.js";
import { isSameOriginRequest } from "../security/same-origin.js";
import { routeBridgeScript } from "./route-bridge.js";
import { hermesAuthority } from "./token.js";

const prefix = settings.hermes.proxyPrefix;
const authority = hermesAuthority();
const upstream = `http://${authority}`;
const websocketUpstream = `ws://${authority}`;
const bufferedMessageLimit = 512 * 1024;
const assetRewriteVersion = "3";

// @fastify/reply-from's runtime response is `{ headers, stream, statusCode }`.
// Its published type models only the underlying raw response and therefore
// omits the runtime `headers` property when undici is used.
type HermesUpstreamResponse = {
  headers: IncomingHttpHeaders;
  stream: Readable;
};

export function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://wrapt.local");
  const pathname = url.pathname === prefix
    ? "/"
    : url.pathname.startsWith(`${prefix}/`)
      ? url.pathname.slice(prefix.length)
      : url.pathname;
  return `${pathname}${url.search}`;
}

export function rewriteLocation(value: string, proxyPrefix = prefix): string {
  // Protocol-relative redirects (`//host/path`) are external URLs and must
  // never be turned into a path below the Workbench proxy.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith(`${proxyPrefix}/`) || value === proxyPrefix) return value;
  return `${proxyPrefix}${value}`;
}

export function rewriteCookiePath(value: string, proxyPrefix = prefix): string {
  return value.replace(/(^|;\s*)Path=([^;]*)/i, (match, start: string, path: string) => {
    if (!path.startsWith("/") || path.startsWith("//") || path === proxyPrefix || path.startsWith(`${proxyPrefix}/`)) return match;
    return `${start}Path=${path === "/" ? proxyPrefix : `${proxyPrefix}${path}`}`;
  });
}

const noStoreCacheControl = "no-store, no-cache, must-revalidate";
const immutableCacheControl = "public, max-age=31536000, immutable";
/**
 * Eigene Regel des Proxy für Dateien, die Hermes ohne jede Cache-Angabe
 * ausliefert. `private`, weil alles unterhalb von `/hermes` hinter der
 * Workbench-Identität liegt und in keine gemeinsame Cache gehört.
 */
const shortCacheControl = "private, max-age=3600";

/** Upstream-Kontext, den `reply-from` beim Antwort-Hook nicht mitgibt. */
export interface HermesCacheContext {
  method: string;
  /** Upstream-Pfad ohne Workbench-Präfix, z. B. `/assets/index-BqKNhaVF.js`. */
  resourcePath: string;
}

/**
 * Hermes deklariert seine gebauten Assets selbst als `immutable` — die Dateinamen
 * tragen einen Inhalts-Hash. Diese Zusage darf der Proxy nicht zerstören: mit
 * `no-store` lud die Workbench vor der Änderung bei jedem Öffnen des
 * Hermes-Fensters rund 500 KB JavaScript erneut, obwohl sich kein Byte geändert
 * hatte.
 */
type UpstreamCachePolicy = "immutable" | "declared" | "silent";

function upstreamCachePolicy(headers: IncomingHttpHeaders): UpstreamCachePolicy {
  const value = headers["cache-control"];
  // Bewusst streng: nur eine fehlende Angabe gilt als Stille. Eine unbekannte
  // Formulierung wie `private, max-age=0` ist eine Entscheidung des Upstreams
  // und wird nicht durch eine eigene Regel überschrieben.
  if (typeof value !== "string") return "silent";
  if (/(?:^|,)\s*immutable\s*(?:,|$)/i.test(value)) return "immutable";
  return "declared";
}

/** Zustandsführende API-Pfade, auch die Wurzel `/api` ohne Schrägstrich. */
function isApiPath(resourcePath: string): boolean {
  return resourcePath === "/api" || resourcePath.startsWith("/api/");
}

/**
 * Ungehashte statische Dateien (`/fonts-terminal`, `/fonts`, `/ds-assets`,
 * `/favicon.ico`) liefert Hermes ohne Cache-Angabe und ohne funktionierende
 * Revalidierung — Starlettes `FileResponse` beantwortet `If-None-Match` nicht,
 * ein 304 kann also nie zustande kommen. `must-revalidate` würde damit nur den
 * vollen Body kosten. Stattdessen bekommen sie eine Stunde Ruhe.
 *
 * Die Bedingungen sind der eigentliche Schutz und keine Kosmetik: ein `etag` und
 * ein `content-type` (nur bei echten Dateien), eine lesende Methode und
 * ausgeschlossen jeder API-Pfad. Ohne diese Grenzen würde auch eine Nutzlast
 * zwischengespeichert.
 *
 * Der `content-type` schließt zugleich `304 Not Modified` aus: Hermes' Datei-
 * Mount setzt die Cache-Angabe nur beim Status 200, ein 304 kommt also weder mit
 * Typ noch mit `cache-control` an. Ohne diese Schranke bekäme die Antwort
 * `max-age=3600` und würde dem Browser die einjährige Frische seines
 * `immutable`-Eintrags wegnehmen. Der 304 bleibt deshalb unverändert — laut HTTP
 * ersetzt er nur die Validatoren des gespeicherten Eintrags.
 */
function isUnversionedStaticFile(context: HermesCacheContext | undefined, headers: IncomingHttpHeaders): boolean {
  if (!context || !headers.etag || !headers["content-type"]) return false;
  if (context.method !== "GET" && context.method !== "HEAD") return false;
  if (context.resourcePath === "" || isApiPath(context.resourcePath)) return false;
  return true;
}

export function rewriteResponseHeaders(
  headers: IncomingHttpHeaders,
  proxyPrefix = prefix,
  cache?: HermesCacheContext,
): IncomingHttpHeaders {
  const result: IncomingHttpHeaders = { ...headers };
  if (typeof result.location === "string") result.location = rewriteLocation(result.location, proxyPrefix);
  if (Array.isArray(result["set-cookie"])) result["set-cookie"] = result["set-cookie"].map((cookie) => rewriteCookiePath(cookie, proxyPrefix));
  // The HTML bridge changes the body length. `reply-from` sends these headers
  // before `onResponse`, so remove the upstream length here rather than too
  // late in the response hook.
  const contentType = result["content-type"];
  const type = typeof contentType === "string" ? contentType.toLowerCase() : "";
  const policy = upstreamCachePolicy(result);
  if (type.includes("text/html")) {
    delete result["content-length"];
    delete result["content-encoding"];
    // HTML trägt das Session-Token, das Hermes bei jedem Prozessstart neu
    // injiziert. Hier ist `no-store` zwingend, unabhängig von Hermes' Angabe.
    result["cache-control"] = noStoreCacheControl;
  } else if (type.includes("javascript")) {
    delete result["content-length"];
    delete result["content-encoding"];
    result["cache-control"] = policy === "immutable"
      ? immutableCacheControl
      : policy === "silent" && isUnversionedStaticFile(cache, result) ? shortCacheControl : noStoreCacheControl;
  } else if (policy === "silent" && isUnversionedStaticFile(cache, result)) {
    result["cache-control"] = shortCacheControl;
  }
  return result;
}

/**
 * Der Versionsmarker darf ausschließlich an JavaScript.
 *
 * Vites Preload-Helfer entscheidet allein an der Endung, ob eine Abhängigkeit
 * ein Stylesheet oder ein Modul ist (`dep.endsWith(".css")`). Hängt am
 * CSS-Eintrag ein `?rw=N`, schlägt diese Prüfung fehl, Vite lädt das Stylesheet
 * als Modul und der Browser bricht mit „Expected a JavaScript-or-Wasm module
 * script but the server responded with a MIME type of text/css" ab. Die
 * Cache-Busting-Absicht betrifft ohnehin nur Module: JavaScript geht mit
 * `immutable` raus (siehe `rewriteResponseHeaders`), CSS-Namen sind
 * inhaltsgehasht.
 *
 * WICHTIG: Der Marker ist jetzt die Invalidierung für die Cache-Regel. JavaScript
 * wird `immutable` ausgeliefert, damit der Browser es nicht bei jedem Öffnen neu
 * lädt. Eine Änderung an `rewriteJavascriptAssetReferences` ändert den umgeschriebenen
 * Body und muss deshalb `assetRewriteVersion` erhöhen — sonst liefert der Browser
 * ein Jahr lang die alte Fassung aus dem Cache.
 */
function withAssetVersion(assetPath: string): string {
  return assetPath.endsWith(".js") ? `${assetPath}?rw=${assetRewriteVersion}` : assetPath;
}

/**
 * Hermes 0.19.x still emits Vite's preload manifest with bare `assets/`
 * entries. Under a prefixed proxy those entries resolve at the Workbench root
 * and receive the Workbench SPA fallback instead of JavaScript. Vite's
 * preloader itself prepends a slash to these entries, so the rewritten value
 * must stay slashless (`hermes/assets/...`), otherwise it becomes the protocol-
 * relative URL `//hermes/assets/...`. Only bare asset references are changed;
 * already prefixed and relative imports remain untouched.
 */
export function rewriteJavascriptAssetReferences(source: string, proxyPrefix = prefix): string {
  const relativePrefix = `${proxyPrefix.replace(/^\/+/, "")}/assets/`;
  const prefixed = source.replace(
    /(["'`])assets\/([^"'`?]+)(["'`])/g,
    (_match, opening: string, file: string, closing: string) => `${opening}${withAssetVersion(`${relativePrefix}${file}`)}${closing}`,
  );
  // Vite/Rolldown emits relative imports for split chunks. Add the same
  // version marker there as well, so a browser that visited an older proxy
  // implementation cannot reuse an unprefixed module from its cache.
  return prefixed.replace(/(["'`])(\.\/[^"'`?]+\.js)(["'`])/g, `$1$2?rw=${assetRewriteVersion}$3`);
}

export function rewriteHtmlAssetUrls(source: string, proxyPrefix = prefix): string {
  const escapedPrefix = proxyPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assetPattern = new RegExp(`(["'])(${escapedPrefix}/assets/[^"']+)(["'])`, "g");
  return source.replace(assetPattern, (_match, opening: string, url: string, closing: string) => `${opening}${url.includes("?") ? url : withAssetVersion(url)}${closing}`);
}

export function proxyRequestHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  return {
    ...headers,
    host: authority,
    "x-forwarded-host": request.headers.host ?? authority,
    "x-forwarded-prefix": prefix,
    "x-forwarded-proto": "https",
    // The HTML bridge needs uncompressed bytes. It also keeps the proxy able
    // to stream responses without having to decode gzip itself.
    "accept-encoding": "identity",
  };
}

/**
 * Der Browser-Origin gehört zur Workbench, der Ziel-Origin zum Loopback-
 * Dashboard. Die Workbench prüft den äußeren Origin bereits vor diesem Punkt.
 * Für Hermes muss der weitergeleitete WebSocket-Handshake trotzdem den
 * Loopback-Origin sehen, sonst lehnt Hermes externe Tailscale-Origins ab.
 */
export function proxyWebSocketHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  const forwarded = { ...headers };
  if (request.headers.origin) forwarded.origin = upstream;
  return proxyRequestHeaders(request, forwarded);
}

function sendProxyError(reply: FastifyReply) {
  if (reply.sent) return;
  return reply.status(502).type("application/json").send({ error: "Das Hermes-Dashboard ist nicht erreichbar." });
}

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  reply.removeHeader("content-security-policy");
  const resourcePath = upstreamPath(request.raw.url ?? request.url);
  const cacheContext = { method: request.method, resourcePath: resourcePath.split("?")[0] ?? "" };
  return reply.from(`${upstream}${resourcePath}`, {
    rewriteRequestHeaders: (_request, headers) => proxyRequestHeaders(request, headers),
    rewriteHeaders: (headers) => rewriteResponseHeaders(headers, prefix, cacheContext),
    onError: () => { sendProxyError(reply); },
    onResponse: (_request, response, rawResponse) => {
      const upstreamResponse = rawResponse as unknown as HermesUpstreamResponse;
      const contentType = upstreamResponse.headers["content-type"];
      const isHtml = typeof contentType === "string" && contentType.toLowerCase().includes("text/html");
      const isJavascript = typeof contentType === "string" && contentType.toLowerCase().includes("javascript");
      if ((!isHtml && !isJavascript) || request.method === "HEAD") {
        response.send(upstreamResponse.stream);
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      upstreamResponse.stream.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes <= 4 * 1024 * 1024) chunks.push(buffer);
      });
      upstreamResponse.stream.on("end", () => {
        if (bytes > 4 * 1024 * 1024) {
          response.status(502).send({ error: "Die Hermes-Dashboard-Seite ist zu groß." });
          return;
        }
        const html = Buffer.concat(chunks).toString("utf8");
        const body = isHtml
          ? (() => {
            const rewritten = rewriteHtmlAssetUrls(html);
            return rewritten.includes("</head>") ? rewritten.replace("</head>", `${routeBridgeScript()}</head>`) : rewritten;
          })()
          : rewriteJavascriptAssetReferences(html);
        response.removeHeader("content-length");
        response.removeHeader("content-encoding");
        response.type(isHtml ? "text/html; charset=utf-8" : contentType ?? "text/javascript; charset=utf-8").send(body);
      });
      upstreamResponse.stream.on("error", () => {
        if (!response.sent) response.status(502).send({ error: "Das Hermes-Dashboard ist nicht erreichbar." });
      });
    },
  });
}

function closeCode(code: number): number { return code === 1005 || code === 1006 ? 1011 : code; }

function rawDataBytes(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((total, chunk) => total + chunk.length, 0);
  return data.byteLength;
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest) {
  if (!isSameOriginRequest(request)) {
    source.close(1008, "FORBIDDEN");
    return;
  }
  const headers: Record<string, string> = proxyWebSocketHeaders(request, {
    ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
    ...(request.headers["user-agent"] ? { "user-agent": request.headers["user-agent"] } : {}),
  });
  const protocolHeader = request.headers["sec-websocket-protocol"];
  const protocols = typeof protocolHeader === "string" ? protocolHeader.split(",").map((item) => item.trim()).filter(Boolean) : [];
  const target = new WebSocket(`${websocketUpstream}${upstreamPath(request.raw.url ?? request.url)}`, protocols, { headers });
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;
  source.on("message", (data, binary) => {
    if (target.readyState === WebSocket.OPEN) { target.send(data, { binary }); return; }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += rawDataBytes(data);
    if (pendingBytes > bufferedMessageLimit) { source.close(1009, "Hermes-WebSocket-Puffer überschritten"); target.terminate(); return; }
    pending.push({ data, binary });
  });
  target.on("open", () => { for (const message of pending.splice(0)) target.send(message.data, { binary: message.binary }); pendingBytes = 0; });
  target.on("message", (data, binary) => { if (source.readyState === WebSocket.OPEN) source.send(data, { binary }); });
  source.on("close", (code, reason) => target.readyState === WebSocket.OPEN ? target.close(closeCode(code), reason) : target.terminate());
  target.on("close", (code, reason) => { if (source.readyState === WebSocket.OPEN) source.close(closeCode(code), reason); });
  source.on("error", () => target.terminate());
  target.on("error", () => { if (source.readyState === WebSocket.OPEN) source.close(1011, "Hermes-Dashboard ist nicht erreichbar"); });
}

export async function registerHermesDashboardProxy(app: FastifyInstance) {
  if (!app.hasReplyDecorator("from")) await app.register(replyFrom);
  app.route({ method: "GET", url: prefix, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
  app.route({ method: "GET", url: `${prefix}/*`, config: { rateLimit: false }, helmet: false, handler: proxyHttp, wsHandler: proxyWebSocket });
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
    app.route({ method, url: `${prefix}/*`, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
  }
}
