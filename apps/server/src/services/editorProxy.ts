import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import replyFrom from "@fastify/reply-from";
import WebSocket from "ws";
import { settings } from "../config/settings.js";
import { isWebSocketOriginAllowed } from "../security/same-origin.js";
import { bridgeWebSockets, type WebSocketBridgeObserver } from "../utils/websocketBridge.js";
import { sendVSCodeWorkbenchResponse } from "./vscodeWorkbenchResponse.js";

const editorPrefix = "/editor";
function usesLegacyProxy(rawUrl: string): boolean {
  return /^\/editor\/(?:absproxy|proxy)\//.test(new URL(rawUrl, "http://wrapt.local").pathname);
}

function upstreamOrigin(rawUrl: string, protocol = "http"): string {
  const port = settings.editorBackend === "vscode" && usesLegacyProxy(rawUrl)
    ? settings.codeServerLegacyPort : settings.codeServerPort;
  return `${protocol}://127.0.0.1:${port}`;
}

function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://wrapt.local");
  if (settings.editorBackend === "vscode" && !usesLegacyProxy(rawUrl)) return `${url.pathname}${url.search}`;
  const pathname = url.pathname.startsWith(editorPrefix)
    ? url.pathname.slice(editorPrefix.length) || "/"
    : url.pathname;
  return `${pathname}${url.search}`;
}

function forwardedHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  return {
    ...headers,
    host: request.headers.host ?? "127.0.0.1:8080",
    "x-forwarded-host": request.headers.host ?? "127.0.0.1:8080",
    "x-forwarded-prefix": editorPrefix,
    "x-forwarded-proto": request.protocol,
  };
}

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  const rawUrl = request.raw.url ?? request.url;
  const editorUpstream = upstreamOrigin(rawUrl);
  const nativeWorkbench = settings.editorBackend === "vscode" && !usesLegacyProxy(rawUrl);
  const startDocument = nativeWorkbench && /^\/editor\/(?:$|(?:stable|insider)-[a-f0-9]{40}\/?$)/.test(new URL(rawUrl, editorUpstream).pathname);
  // The trusted loopback upstream owns its CSP. Keeping the Workbench CSP here
  // would block Vite's React preamble and code-server's nonce/eval policy.
  reply.removeHeader("content-security-policy");
  if (upstreamPath(request.raw.url ?? request.url).startsWith("/absproxy/")) {
    reply.header(
      "content-security-policy",
      "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: https:; img-src 'self' data: blob: https:; font-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'self'",
    );
  }
  return reply.from(`${editorUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    rewriteRequestHeaders: (_originalRequest, headers) => {
      const forwarded = forwardedHeaders(request, headers);
      if (startDocument) {
        forwarded["accept-encoding"] = "identity";
      }
      return forwarded;
    },
    ...(startDocument ? {
      onResponse: (_request, response, rawResponse) => sendVSCodeWorkbenchResponse(response, rawResponse as unknown as Parameters<typeof sendVSCodeWorkbenchResponse>[1]),
    } : {}),
  });
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest, observer?: WebSocketBridgeObserver) {
  if (!isWebSocketOriginAllowed(request)) {
    source.close(1008, "Cross-Origin-WebSocket abgelehnt");
    return;
  }
  const protocolHeader = request.headers["sec-websocket-protocol"];
  const protocols = typeof protocolHeader === "string"
    ? protocolHeader.split(",").map((protocol) => protocol.trim()).filter(Boolean)
    : [];
  const optionalHeaders: Record<string, string> = {};
  if (request.headers.cookie) optionalHeaders.cookie = request.headers.cookie;
  if (request.headers.origin) optionalHeaders.origin = request.headers.origin;
  if (request.headers["user-agent"]) optionalHeaders["user-agent"] = request.headers["user-agent"];
  const target = new WebSocket(
    `${upstreamOrigin(request.raw.url ?? request.url, "ws")}${upstreamPath(request.raw.url ?? request.url)}`,
    protocols,
    {
      headers: forwardedHeaders(request, optionalHeaders),
      // Auf dem Loopback-Hop spart Kompression keine Netzwerkzeit. Ohne sie
      // erreichen kleine Eingabe-, Hover- und Dateisystemnachrichten den
      // code-server ohne zusätzlichen Deflate-Durchlauf.
      perMessageDeflate: false,
    },
  );
  bridgeWebSockets(source, target, { label: "Editor", ...(observer === undefined ? {} : { observer }) });
}

export async function registerEditorProxy(app: FastifyInstance, observer?: WebSocketBridgeObserver) {
  await app.register(async (scope) => {
    // Multipart gehört nur in diesen Proxy-Scope: reply-from erhält dadurch
    // die originalen Bytes, während die Upload-Routen ihren eigenen Parser
    // gekapselt im API-Scope behalten.
    scope.addContentTypeParser("multipart/form-data", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    await scope.register(replyFrom);

    for (const url of ["/editor", "/editor/*"]) {
      scope.route({
        method: "GET",
        url,
        // The trusted upstream owns its response policy. Applying Workbench's
        // CSP/X-Frame-Options here breaks code-server's hashed worker bootstrap
        // and makes Firefox warn about duplicate framing policies.
        config: { rateLimit: false },
        helmet: false,
        handler: (request, reply) => request.url.split("?")[0] === editorPrefix
          ? reply.redirect(`${editorPrefix}/${new URL(request.url, "http://wrapt.local").search}`, 308)
          : proxyHttp(request, reply),
        wsHandler: (source, request) => proxyWebSocket(source, request, observer),
      });
      scope.route({
        method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"],
        url,
        config: { rateLimit: false },
        helmet: false,
        handler: proxyHttp,
      });
    }
  });
}
