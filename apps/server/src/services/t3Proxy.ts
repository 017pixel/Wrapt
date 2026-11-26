import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import replyFrom from "@fastify/reply-from";
import WebSocket from "ws";
import { settings } from "../config/settings.js";
import { isWebSocketOriginAllowed } from "../security/same-origin.js";
import { RateBudget } from "../utils/rate-budget.js";
import { bridgeWebSockets, type WebSocketBridgeObserver } from "../utils/websocketBridge.js";
import { injectShortcutBridge } from "./shortcutBridge.js";
import { t3RouteBridgeScript } from "./t3RouteBridge.js";
import { mergeProxyContentSecurityPolicy } from "./proxy-csp.js";
import { remoteEditorFallbackScript } from "./t3EditorBridge.js";

const t3Prefix = "/t3";
// Genau eine Instanz, unabhängig vom Kanal. Adresse aus der Config, damit Proxy,
// systemd-Unit und Health-Check nicht auseinanderlaufen können.
const t3Authority = `${settings.t3Host}:${settings.t3Port}`;
const t3HttpUpstream = `http://${t3Authority}`;
const t3WebSocketUpstream = `ws://${t3Authority}`;
const maxInjectedHtmlBytes = 4 * 1024 * 1024;
// T3 nimmt Bilder bis 10 MiB und Dateien bis 50 MiB an. Das globale
// Fastify-Limit von 1 MiB würde die als Buffer geparsten Uploads schon im
// Proxy mit 413 ablehnen. 64 MiB deckt T3s eigenes Dateilimit ab; die
// fachliche Prüfung bleibt bei T3.
export const t3AttachmentUploadBodyLimit = 64 * 1024 * 1024;

// Browser-Hilfe für T3s „Open in …"-Einträge liegt fachlich getrennt.
export { t3IsEditorOpenButton, t3OpenInCwdFromFiber } from "./t3EditorBridge.js";
export { remoteEditorFallbackScript };

export const t3HttpRoutes = [
  "/", "/t3/*", "/assets/*", "/.well-known/t3/*", "/api/auth/*",
  "/api/assets/*", "/api/attachments/*", "/api/orchestration/*", "/api/connect/*", "/api/t3-connect/*", "/api/observability/*", "/api/pull-requests/*", "/api/preview-stream/*", "/oauth/*",
  "/favicon.ico", "/apple-touch-icon.png", "/manifest.webmanifest",
] as const;

// Routen mit WebSocket-Upgrade: T3s integrierte Browser-Fläche streamt über
// /api/preview-stream/ws (Thread- und Tab-ID als Query). Ohne wsHandler
// antwortet der Proxy mit 404 und die Fläche zeigt „Browser connection was
// refused". /ws bleibt der Kanal für RPC und Session-State.
export const t3WebSocketRoutes = ["/ws", "/api/preview-stream/*"] as const;

function contentType(headers: IncomingHttpHeaders): string {
  const value = headers["content-type"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isHtml(headers: IncomingHttpHeaders): boolean {
  return contentType(headers).toLowerCase().includes("text/html");
}

export function injectT3HtmlBridge(html: string): string {
  const bridge = `${t3RouteBridgeScript}${remoteEditorFallbackScript}`;
  return injectShortcutBridge(html.includes("</head>") ? html.replace("</head>", `${bridge}</head>`) : `${bridge}${html}`);
}

function rewriteResponseHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const result = { ...headers };
  if (isHtml(result)) {
    // The bridge changes the body length. Remove upstream framing headers
    // before @fastify/reply-from starts the response.
    delete result["content-length"];
    delete result["content-encoding"];
    result["cache-control"] = "no-store, no-cache, must-revalidate";
    // S-007: Upstream-CSP mergen statt entfernen (Einbettungs-Härtung).
    return mergeProxyContentSecurityPolicy(result).headers;
  }
  return result;
}

type T3UpstreamResponse = {
  headers: IncomingHttpHeaders;
  stream: Readable;
};

function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://wrapt.local");
  const pathname = url.pathname === t3Prefix
    ? "/"
    : url.pathname.startsWith(`${t3Prefix}/`)
      ? url.pathname.slice(t3Prefix.length)
      : url.pathname;
  return `${pathname}${url.search}`;
}

function proxyHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  return {
    ...headers,
    host: request.headers.host ?? t3Authority,
    "x-forwarded-host": request.headers.host ?? t3Authority,
    "x-forwarded-prefix": t3Prefix,
    "x-forwarded-proto": "https",
    // HTML deep-link normalization happens in onResponse. Keep the upstream
    // body readable instead of buffering compressed bytes.
    "accept-encoding": "identity",
  };
}

// Eigenes Budget für den T3-Proxy (S-009): 600 Requests/Minute pro Identität.
// Der globale API-Limiter nimmt /t3 bewusst aus; ohne eigenes Budget wäre der
// teuerste Pfad unlimitiert. Normale Nutzung (Assets + API) liegt weit darunter.
const t3RateBudget = new RateBudget({ maxEvents: 600, windowMilliseconds: 60_000 });

function t3RateKey(request: FastifyRequest): string {
  const identity = request.headers["tailscale-user-login"];
  return typeof identity === "string" && identity.length > 0 ? identity : request.ip;
}

function proxyHttp(upstream: string, request: FastifyRequest, reply: FastifyReply) {
  if (!t3RateBudget.tryConsume(t3RateKey(request))) {
    return reply.status(429).send({ error: "T3_RATE_LIMITED" });
  }
  return reply.from(`${upstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    rewriteRequestHeaders: (_originalRequest, headers) => proxyHeaders(request, headers),
    rewriteHeaders: (headers) => rewriteResponseHeaders(headers),
    onResponse: (_request, response, rawResponse) => {
      const upstreamResponse = rawResponse as unknown as T3UpstreamResponse;
      if (!isHtml(upstreamResponse.headers) || request.method === "HEAD") {
        response.send(upstreamResponse.stream);
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      upstreamResponse.stream.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes <= maxInjectedHtmlBytes) chunks.push(buffer);
      });
      upstreamResponse.stream.on("end", () => {
        if (bytes > maxInjectedHtmlBytes) {
          response.status(502).type("text/plain").send("Die T3-Code-Seite ist zu groß.");
          return;
        }
        response.type("text/html; charset=utf-8").send(injectT3HtmlBridge(Buffer.concat(chunks).toString("utf8")));
      });
      upstreamResponse.stream.on("error", () => {
        if (!response.sent) response.status(502).type("text/plain").send("T3 Code ist nicht erreichbar.");
      });
    },
  });
}

async function proxyIndex(_request: FastifyRequest, reply: FastifyReply) {
  let response: Response;
  try {
    // Harte Schranke wie beim Hermes-Client (D-013/D-017.6): Ohne Timeout hängt
    // der Request bei totem T3-Port bis zum globalen Server-Timeout.
    response = await fetch(`${t3HttpUpstream}/`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return reply.status(502).type("text/plain").send("T3 Code ist nicht erreichbar.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    return reply.status(response.status).type("text/plain").send("T3 Code ist nicht erreichbar.");
  }
  // Dieselbe harte Byte-Grenze wie im injizierenden Proxy-Pfad (F01-09).
  const reader = response.body?.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxInjectedHtmlBytes) {
        await reader.cancel();
        return reply.status(502).type("text/plain").send("Die T3-Code-Seite ist zu groß.");
      }
      chunks.push(Buffer.from(value));
    }
  }
  const upstreamCsp = response.headers.get("content-security-policy");
  const mergedPolicy = mergeProxyContentSecurityPolicy(
    upstreamCsp ? { "content-security-policy": upstreamCsp } : {},
  ).headers["content-security-policy"];
  if (typeof mergedPolicy === "string") reply.header("content-security-policy", mergedPolicy);
  return reply.type("text/html").send(injectT3HtmlBridge(Buffer.concat(chunks, bytes).toString("utf8")));
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest, observer?: WebSocketBridgeObserver) {
  if (!isWebSocketOriginAllowed(request)) {
    source.close(1008, "Cross-Origin-WebSocket abgelehnt");
    return;
  }
  const optionalHeaders: Record<string, string> = {};
  for (const headerName of ["authorization", "cookie", "origin", "sec-websocket-protocol", "user-agent"] as const) {
    const value = request.headers[headerName];
    if (typeof value === "string") optionalHeaders[headerName] = value;
  }
  const target = new WebSocket(`${t3WebSocketUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    headers: proxyHeaders(request, optionalHeaders),
  });
  // Eigene, großzügigere Puffergrenzen: V2-Snapshots sind deutlich größer als
  // die Standardwerte der übrigen Brücken.
  bridgeWebSockets(source, target, {
    label: "T3 Code",
    pendingLimit: settings.t3WebSocketPendingBytes,
    bufferedLimit: settings.t3WebSocketBufferedBytes,
    ...(observer === undefined ? {} : { observer }),
  });
}

export async function registerT3Proxy(app: FastifyInstance, observer?: WebSocketBridgeObserver, upstream = t3HttpUpstream) {
  const proxyHttpHandler = proxyHttp.bind(null, upstream);
  await app.register(async (scope) => {
    // T3 lädt Anhänge per XHR als rohe Bytes hoch (Content-Type ist der
    // MIME-Typ der Datei, z. B. image/png). Ohne Buffer-Parser antwortet
    // Fastify mit 415, bevor reply-from die Bytes an T3 weiterreichen kann.
    // JSON bleibt beim Standard-Parser; nur Binärtypen werden als Buffer
    // durchgereicht (Muster aus dem Editor-Proxy für multipart).
    for (const contentType of ["application/octet-stream", "application/pdf"] as const) {
      scope.addContentTypeParser(contentType, { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    }
    for (const contentType of [/^image\/.*$/, /^video\/.*$/, /^audio\/.*$/] as const) {
      scope.addContentTypeParser(contentType, { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    }
    await scope.register(replyFrom);

    scope.route({ method: "GET", url: "/t3", config: { rateLimit: false }, helmet: false, handler: proxyIndex });
    for (const url of t3HttpRoutes) {
      // WebSocket-Routen bekommen ihren Upgrade-Handler unten; hier nur die
      // übrigen Methoden, damit Fastify keine doppelte GET-Route meldet.
      if (!(t3WebSocketRoutes as readonly string[]).includes(url)) {
        scope.route({ method: "GET", url, config: { rateLimit: false }, helmet: false, handler: proxyHttpHandler });
      }
      scope.route({
        method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"],
        url,
        config: { rateLimit: false },
        helmet: false,
        // Nur der Upload-Pfad braucht das große Limit; alle anderen T3-Routen
        // behalten Fastifys 1-MiB-Grenze.
        ...(url === "/api/attachments/*" ? { bodyLimit: t3AttachmentUploadBodyLimit } : {}),
        handler: proxyHttpHandler,
      });
    }
    for (const url of t3WebSocketRoutes) {
      scope.route({ method: "GET", url, config: { rateLimit: false }, helmet: false, handler: proxyHttpHandler, wsHandler: (source, request) => proxyWebSocket(source, request, observer) });
    }
  });
}
