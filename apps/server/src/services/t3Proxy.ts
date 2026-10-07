import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import replyFrom from "@fastify/reply-from";
import WebSocket from "ws";
import { settings } from "../config/settings.js";
import { isWebSocketOriginAllowed } from "../security/same-origin.js";
import { bridgeWebSockets, type WebSocketBridgeObserver } from "../utils/websocketBridge.js";
import { t3RouteBridgeScript } from "./t3RouteBridge.js";

const t3Prefix = "/t3";
// Genau eine Instanz, unabhängig vom Kanal. Adresse aus der Config, damit Proxy,
// systemd-Unit und Health-Check nicht auseinanderlaufen können.
const t3Authority = `${settings.t3Host}:${settings.t3Port}`;
const t3HttpUpstream = `http://${t3Authority}`;
const t3WebSocketUpstream = `ws://${t3Authority}`;
const maxInjectedHtmlBytes = 4 * 1024 * 1024;

// T3 Code öffnet „Open in …" im Web als `vscode://vscode-remote/
// ssh-remote+<host><pfad>`-Deep-Link über `window.location.assign`. Ohne
// registrierten Schema-Handler bleibt dieser Klick wirkungslos. Die URL selbst
// lässt sich nicht abfangen: `window.location.assign` ist in Chrome und
// Firefox eine nicht überschreibbare Browser-Property. Das Script fängt
// deshalb den Klick auf alle T3-„Open"-Einträge ab (kompakter Toolbar-Button,
// Panel-Zeile „Open in …", Menüeinträge), liest den Zielordner aus den
// React-Props der Komponente und öffnet ihn auf der Code-Editor-Seite der
// Workbench: eingebettet per postMessage an das umgebende ToolPanel, im
// eigenständigen Fenster direkt als `/code-editor`-Navigation. Ohne
// ablesbaren Ordner öffnet die Workbench ihr aktives Projekt. Bei Hover und
// Fokus wird das Editor-Dokument einmalig vorgeladen, damit der Klick ohne
// spürbare Wartezeit wirkt.
export const remoteEditorFallbackScript = `<script>
(() => {
  const messageType = "wrapt:open-editor";
  const mark = "data-wrapt-editor-fallback";
  const preloaded = new Set();
  const inMenu = (element) => !!element.closest('[role="menu"], [role="dialog"], [class*="thread-details-action"]');
  // Reine Trefferprüfung ohne Markierung: Der Preload nutzt sie ebenfalls,
  // damit Hover auf bereits gebundenen Einträgen weiter vorlädt.
  // Nur Buttons und Menüeinträge zählen; andere Elemente mit passendem Text
  // bleiben unangetastet.
  const matchesOpenButton = (element) => {
    if (!(element instanceof HTMLButtonElement) && element.getAttribute("role") !== "menuitem") return false;
    // Kompakter Modus (z. B. schmale Panels): nur aria-label, Text ist sr-only.
    if (element.getAttribute("aria-label") === "Open file in preferred editor") return true;
    const label = (element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "").trim();
    if (label === "Open") {
      if (!element.closest("[data-chat-header-actions]")) return false;
      if (!element.querySelector("svg")) return false;
      return true;
    }
    // „Open in…" (ohne Leerzeichen) ist der Untermenü-Auslöser und bleibt unangetastet.
    if (!label.startsWith("Open in ")) return false;
    if (!element.querySelector("svg")) return false;
    if (!element.closest("[data-chat-header-actions]") && !inMenu(element)) return false;
    return true;
  };
  const isOpenButton = (element) => {
    if (element.getAttribute(mark) === "true") return false;
    return matchesOpenButton(element);
  };
  // Der Zielordner steckt als openInCwd in den React-Props der
  // OpenInPicker-Komponente. React legt dafür einen internen Fiber-Marker auf
  // dem DOM-Knoten ab; die Kette wird zum ersten Knoten mit openInCwd gelaufen.
  const openInCwdFrom = (button) => {
    const fiberKey = Object.keys(button).find((key) => key.startsWith("__reactFiber$"));
    if (!fiberKey) return null;
    let fiber = button[fiberKey];
    for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props && typeof props.openInCwd === "string" && props.openInCwd.length > 0) return props.openInCwd;
    }
    return null;
  };
  const openEditor = (button) => {
    const folder = openInCwdFrom(button);
    const message = { type: messageType, ...(folder ? { folder } : {}) };
    // Ohne ablesbaren Ordner meldet der Eintrag trotzdem: Die Workbench
    // öffnet dann ihr aktives Projekt statt des toten vscode://-Links.
    // Der Basename /wrapt gehört dazu (Vite base, statisches Prefix in
    // static.ts); ohne ihn antwortet der Server mit 404.
    if (window.parent === window) {
      const query = folder ? "?" + new URLSearchParams({ folder }).toString() : "";
      window.location.assign("/wrapt/code-editor/" + query);
    } else {
      window.parent.postMessage(message, window.location.origin);
    }
  };
  const preloadEditor = (target) => {
    const element = target instanceof Element ? element.closest("button, [role=menuitem]") : null;
    if (!element || !matchesOpenButton(element)) return;
    const folder = openInCwdFrom(element) ?? "";
    if (preloaded.has(folder)) return;
    // Begrenzt halten: Ein Eintrag pro Ordner reicht, der Rest wäre totes DOM.
    if (preloaded.size >= 25) preloaded.delete(preloaded.values().next().value);
    preloaded.add(folder);
    // Ziel ist bewusst das /editor/-Dokument: Genau diese URL lädt später das
    // iframe der Code-Editor-Seite, die Shell-Seite selbst ist längst da.
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = folder ? "/editor/?" + new URLSearchParams({ folder }).toString() : "/editor/";
    document.head.appendChild(link);
  };
  const bind = (button) => {
    if (!(button instanceof Element)) return;
    if (!isOpenButton(button)) return;
    button.setAttribute(mark, "true");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openEditor(button);
    }, true);
    // Nur echte Zustandsänderungen schreiben, sonst dreht der Observer sich
    // in Firefox endlos.
    if (button instanceof HTMLButtonElement && button.disabled) button.disabled = false;
    if (button.hasAttribute("aria-disabled")) button.removeAttribute("aria-disabled");
    if (button.classList.contains("cursor-not-allowed") || button.classList.contains("opacity-40")) {
      button.classList.remove("cursor-not-allowed", "opacity-40");
    }
  };
  const scan = (root) => {
    if (!(root instanceof Element)) return;
    bind(root);
    for (const button of root.querySelectorAll("button, [role=menuitem]")) bind(button);
  };
  document.addEventListener("mouseover", (event) => preloadEditor(event.target), true);
  document.addEventListener("focusin", (event) => preloadEditor(event.target), true);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) scan(node);
      } else if (record.type === "attributes") {
        bind(record.target);
      } else {
        bind(record.target.parentElement?.closest("button, [role=menuitem]"));
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "class", "aria-label"],
    characterData: true,
  });
  scan(document.documentElement);
})();
</script>`;

// Reine Kernlogik des Editor-Fallbacks, damit die Button-Erkennung und die
// React-Prop-Suche deterministisch testbar sind. Das injizierte Script
// enthält dieselbe Logik inline und läuft im Browser-Kontext von T3 Code.
// „Open in…" (ohne Leerzeichen) ist der Untermenü-Auslöser und zählt nie dazu.
// isEntry bildet die Elementprüfung des Scripts nach (Button oder Menüeintrag).
export function t3IsEditorOpenButton(input: {
  ariaLabel: string | null;
  text: string | null;
  inHeaderActions: boolean;
  hasIcon: boolean;
  inMenu: boolean;
  isEntry: boolean;
}): boolean {
  if (!input.isEntry) return false;
  if (input.ariaLabel === "Open file in preferred editor") return true;
  const label = (input.ariaLabel ?? input.text ?? "").trim();
  if (label === "Open") return input.inHeaderActions && input.hasIcon;
  if (label.startsWith("Open in ") && input.hasIcon) return input.inHeaderActions || input.inMenu;
  return false;
}

export function t3OpenInCwdFromFiber(element: unknown): string | null {
  if (element === null || typeof element !== "object") return null;
  const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  let fiber = (element as Record<string, unknown>)[fiberKey] as {
    return?: unknown;
    memoizedProps?: { openInCwd?: unknown } | null;
  } | null;
  for (let depth = 0; fiber && depth < 24; depth += 1) {
    const props = fiber.memoizedProps;
    if (props && typeof props.openInCwd === "string" && props.openInCwd.length > 0) return props.openInCwd;
    fiber = fiber.return as typeof fiber;
  }
  return null;
}

export const t3HttpRoutes = [
  "/", "/t3/*", "/assets/*", "/.well-known/t3/*", "/api/auth/*",
  "/api/assets/*", "/api/attachments/*", "/api/orchestration/*", "/api/connect/*", "/api/t3-connect/*", "/api/observability/*", "/api/pull-requests/*", "/oauth/*",
  "/favicon.ico", "/apple-touch-icon.png", "/manifest.webmanifest",
] as const;

function contentType(headers: IncomingHttpHeaders): string {
  const value = headers["content-type"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isHtml(headers: IncomingHttpHeaders): boolean {
  return contentType(headers).toLowerCase().includes("text/html");
}

export function injectT3HtmlBridge(html: string): string {
  const bridge = `${t3RouteBridgeScript}${remoteEditorFallbackScript}`;
  return html.includes("</head>") ? html.replace("</head>", `${bridge}</head>`) : `${bridge}${html}`;
}

function rewriteResponseHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const result = { ...headers };
  if (isHtml(result)) {
    // The bridge changes the body length. Remove upstream framing headers
    // before @fastify/reply-from starts the response.
    delete result["content-length"];
    delete result["content-encoding"];
    result["cache-control"] = "no-store, no-cache, must-revalidate";
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

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  reply.removeHeader("content-security-policy");
  return reply.from(`${t3HttpUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
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
  const response = await fetch(`${t3HttpUpstream}/`);
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
  reply.removeHeader("content-security-policy");
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

export async function registerT3Proxy(app: FastifyInstance, observer?: WebSocketBridgeObserver) {
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
      scope.route({ method: "GET", url, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
      scope.route({ method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"], url, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
    }
    scope.route({ method: "GET", url: "/ws", config: { rateLimit: false }, helmet: false, handler: proxyHttp, wsHandler: (source, request) => proxyWebSocket(source, request, observer) });
  });
}
