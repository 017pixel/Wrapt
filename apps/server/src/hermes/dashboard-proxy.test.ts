import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { proxyRequestHeaders, proxyWebSocketHeaders, rewriteCookiePath, rewriteHtmlAssetUrls, rewriteJavascriptAssetReferences, rewriteLocation, rewriteResponseHeaders, routeBridgeScript, upstreamPath } from "./dashboard-proxy.js";

describe("Hermes-Dashboard-Proxy", () => {
  it("schreibt den Präfixpfad korrekt zum Dashboard um", () => {
    expect(upstreamPath("/hermes")).toBe("/");
    expect(upstreamPath("/hermes/")).toBe("/");
    expect(upstreamPath("/hermes/settings?tab=cron")).toBe("/settings?tab=cron");
    expect(upstreamPath("/settings")).toBe("/settings");
  });

  it("setzt Hermes' Upstream-Host und den Forwarded-Präfix", () => {
    const headers = proxyRequestHeaders({ headers: { host: "workbench.example" } } as FastifyRequest, { accept: "text/html" });
    expect(headers.host).toBe("127.0.0.1:9119");
    expect(headers["x-forwarded-prefix"]).toBe("/hermes");
    expect(headers["x-forwarded-host"]).toBe("workbench.example");
  });

  it("übersetzt den äußeren WebSocket-Origin auf den Loopback-Upstream", () => {
    const headers = proxyWebSocketHeaders({
      headers: {
        host: "hermes.example",
        origin: "https://hermes.example",
        cookie: "session=1",
      },
    } as FastifyRequest, { cookie: "session=1" }) as Record<string, string | string[] | undefined>;
    expect(headers.origin).toBe("http://127.0.0.1:9119");
    expect(headers.cookie).toBe("session=1");
    expect(headers["x-forwarded-host"]).toBe("hermes.example");
  });

  it("fügt bei WebSocket-Clients ohne Origin keinen künstlichen Origin hinzu", () => {
    const headers = proxyWebSocketHeaders({ headers: { host: "hermes.example" } } as FastifyRequest, {}) as Record<string, string | string[] | undefined>;
    expect(headers.origin).toBeUndefined();
  });

  it("schreibt Redirects und Cookie-Pfade um, aber keine fremden absoluten URLs", () => {
    expect(rewriteLocation("/settings")).toBe("/hermes/settings");
    expect(rewriteLocation("/hermes/settings")).toBe("/hermes/settings");
    expect(rewriteLocation("//other.example/settings")).toBe("//other.example/settings");
    expect(rewriteLocation("https://other.example/settings")).toBe("https://other.example/settings");
    expect(rewriteCookiePath("session=1; Path=/; HttpOnly")).toBe("session=1; Path=/hermes; HttpOnly");
    expect(rewriteCookiePath("session=1; Path=/api; Secure")).toBe("session=1; Path=/hermes/api; Secure");
    expect(rewriteCookiePath("session=1; Path=//other.example; Secure")).toBe("session=1; Path=//other.example; Secure");
  });

  it("entfernt die HTML-Längen- und Kompressionsheader vor der Bridge-Injektion", () => {
    const headers = rewriteResponseHeaders({
      "content-type": "text/html; charset=utf-8",
      "content-length": "123",
      "content-encoding": "gzip",
    });
    expect(headers["content-type"]).toContain("text/html");
    expect(headers["content-length"]).toBeUndefined();
    expect(headers["content-encoding"]).toBeUndefined();
  });

  it("präfixt bare Vite-Assetreferenzen in Hermes-JavaScript", () => {
    expect(rewriteJavascriptAssetReferences('const a="assets/SessionsPage.js"; const b=`assets/vendor.js`; const c="./assets/local.js"; const d=import("./index.js");')).toBe('const a="hermes/assets/SessionsPage.js?rw=3"; const b=`hermes/assets/vendor.js?rw=3`; const c="./assets/local.js?rw=3"; const d=import("./index.js?rw=3");');
  });

  it("hängt den Versionsmarker nie an CSS im Vite-Preload-Manifest", () => {
    // Vite erkennt Stylesheets nur an der Endung. Mit `?rw=N` würde das
    // Stylesheet als Modul geladen und der Browser bräche mit einem
    // MIME-Type-Fehler ab.
    expect(rewriteJavascriptAssetReferences('const deps=["assets/index-Abc123.css","assets/xterm-Def456.css","assets/SystemPage-Ghi789.js"];')).toBe('const deps=["hermes/assets/index-Abc123.css","hermes/assets/xterm-Def456.css","hermes/assets/SystemPage-Ghi789.js?rw=3"];');
  });

  it("bustet den Browser-Cache für präfixierte Dashboard-Assets, aber nicht für CSS", () => {
    expect(rewriteHtmlAssetUrls('<script src="/hermes/assets/index.js"></script><link href="/hermes/assets/app.css?v=2">')).toBe('<script src="/hermes/assets/index.js?rw=3"></script><link href="/hermes/assets/app.css?v=2">');
    expect(rewriteHtmlAssetUrls('<link href="/hermes/assets/index-Abc123.css">')).toBe('<link href="/hermes/assets/index-Abc123.css">');
  });

  it("meldet Routenwechsel nach oben und nimmt Navigationsbefehle entgegen", () => {
    const bridge = routeBridgeScript();
    // Nach oben: die Workbench merkt sich die zuletzt besuchte Hermes-Seite.
    expect(bridge).toContain("route.changed");
    expect(bridge).toContain("window.parent.postMessage");
    // Nach unten: Seitenwechsel ohne Neuladen der SPA.
    expect(bridge).toContain("route.navigate");
    expect(bridge).toContain("history.pushState");
    expect(bridge).toContain("PopStateEvent");
    // Geparkte Hermes-Flächen behalten WebSockets, pausieren aber Polling.
    expect(bridge).toContain("host.activity");
    expect(bridge).toContain("if (hostActive) callback");
  });

  it("nimmt nur Navigationsbefehle vom eigenen Origin mit unverdächtigem Pfad an", () => {
    const bridge = routeBridgeScript();
    expect(bridge).toContain("event.origin !== location.origin");
    expect(bridge).toContain('data.path.startsWith("/")');
    expect(bridge).toContain('data.path.includes("..")');
    expect(bridge).toContain('data.path.startsWith("//")');
  });

  it("entfernt auch JavaScript-Längenheader bei einer Asset-Umschreibung", () => {
    const headers = rewriteResponseHeaders({
      "content-type": "text/javascript; charset=utf-8",
      "content-length": "123",
      "content-encoding": "gzip",
    });
    expect(headers["content-length"]).toBeUndefined();
    expect(headers["content-encoding"]).toBeUndefined();
  });

  it("gibt die Unveränderlichkeit upstream-gehashter JavaScript weiter", () => {
    // Hermes’ `_ImmutableAssetFiles` deklariert die gebauten Module bereits als
    // `immutable`. Mit `no-store` lud die Workbench vor der Änderung bei jedem
    // Öffnen des Hermes-Fensters rund 500 KB erneut.
    const headers = rewriteResponseHeaders({
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": "123",
    }, "/hermes", { method: "GET", resourcePath: "/assets/index-BqKNhaVF.js" });
    expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(headers["content-length"]).toBeUndefined();
  });

  it("respektiert auch eine ungewohnte Upstream-Angabe statt sie zu ersetzen", () => {
    // `private, max-age=0` ist eine Entscheidung des Upstreams, keine Stille.
    // Bei unverändertem Body wird sie unverändert durchgereicht.
    for (const contentType of ["font/woff2", "application/json"]) {
      const headers = rewriteResponseHeaders({
        "content-type": contentType,
        "cache-control": "private, max-age=0",
        etag: '"abc"',
      }, "/hermes", { method: "GET", resourcePath: "/fonts-terminal/JetBrainsMono-Regular.woff2" });
      expect(headers["cache-control"]).toBe("private, max-age=0");
    }
    // Bei JavaScript muss der Proxy selbst entscheiden, weil er den Body
    // umschreibt und damit die Upstream-Zusage nicht mehr garantieren kann.
    // Ohne `immutable` bleibt deshalb nur das sichere `no-store`.
    const script = rewriteResponseHeaders({
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "private, max-age=0",
      etag: '"abc"',
    }, "/hermes", { method: "GET", resourcePath: "/assets/handwritten.js" });
    expect(script["cache-control"]).toBe("no-store, no-cache, must-revalidate");
  });

  it("behält `no-store` für JavaScript mit ausdrücklicher Upstream-Zusage", () => {
    // Hermes verbietet das Cachen für Plugin-Bundles ausdrücklich
    // (`hermes_cli/web_routers/dashboard_ui.py`).
    const headers = rewriteResponseHeaders({
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      etag: '"abc"',
    }, "/hermes", { method: "GET", resourcePath: "/dashboard-plugins/kanban/dist/index.js" });
    expect(headers["cache-control"]).toBe("no-store, no-cache, must-revalidate");
  });

  it("hält HTML immer `no-store`, weil Hermes das Session-Token neu injiziert", () => {
    const headers = rewriteResponseHeaders({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    }, "/hermes", { method: "GET", resourcePath: "/chat" });
    expect(headers["cache-control"]).toBe("no-store, no-cache, must-revalidate");
  });

  it("gibt ungehashten statischen Dateien eine Stunde statt sofortiger Revalidierung", () => {
    // `/fonts-terminal` liefert Hermes ohne Cache-Angabe und ohne 304-Fähigkeit:
    // 276 KB Terminal-Fonts, die sonst bei jedem Aufruf vollständig neu kommen.
    const headers = rewriteResponseHeaders({
      "content-type": "font/woff2",
      etag: '"18545b4e"',
      "content-length": "92380",
    }, "/hermes", { method: "GET", resourcePath: "/fonts-terminal/JetBrainsMono-Regular.woff2" });
    expect(headers["cache-control"]).toBe("private, max-age=3600");
    expect(headers["content-length"]).toBe("92380");
  });

  it("fasst API-Antworten und schreibende Methoden nicht an", () => {
    const api = rewriteResponseHeaders({ "content-type": "application/json", etag: '"abc"' }, "/hermes", { method: "GET", resourcePath: "/api/sessions" });
    expect(api["cache-control"]).toBeUndefined();
    const apiRoot = rewriteResponseHeaders({ "content-type": "application/json", etag: '"abc"' }, "/hermes", { method: "GET", resourcePath: "/api" });
    expect(apiRoot["cache-control"]).toBeUndefined();
    const pluginApi = rewriteResponseHeaders({ "content-type": "application/json", etag: '"abc"' }, "/hermes", { method: "GET", resourcePath: "/api/plugins/kanban/board" });
    expect(pluginApi["cache-control"]).toBeUndefined();
    const post = rewriteResponseHeaders({ "content-type": "image/png", etag: '"abc"' }, "/hermes", { method: "POST", resourcePath: "/files/upload" });
    expect(post["cache-control"]).toBeUndefined();
    const postJs = rewriteResponseHeaders({ "content-type": "text/javascript", etag: '"abc"' }, "/hermes", { method: "POST", resourcePath: "/files/upload.js" });
    expect(postJs["cache-control"]).toBe("no-store, no-cache, must-revalidate");
    const withoutEtag = rewriteResponseHeaders({ "content-type": "font/woff2" }, "/hermes", { method: "GET", resourcePath: "/fonts-terminal/JetBrainsMono-Regular.woff2" });
    expect(withoutEtag["cache-control"]).toBeUndefined();
  });

  it("respektiert eine vorhandene Upstream-Cache-Regel auch bei statischen Dateien", () => {
    const headers = rewriteResponseHeaders({
      "content-type": "font/woff2",
      etag: '"abc"',
      "cache-control": "public, max-age=31536000, immutable",
    }, "/hermes", { method: "GET", resourcePath: "/assets/Collapse-Bold-mgICk9-_.woff2" });
    expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("lässt Assets ohne Kontextangabe unverändert", () => {
    // Ohne `cache`-Kontext kennt der Proxy weder Methode noch Pfad und fasst
    // deshalb gar nichts an.
    const headers = rewriteResponseHeaders({ "content-type": "font/woff2", etag: '"abc"' });
    expect(headers["cache-control"]).toBeUndefined();
  });

  it("lässt ein 304 unangetastet, damit die einjährige Frische erhalten bleibt", () => {
    // Hermes' Datei-Mount setzt `cache-control` nur beim Status 200. Ein 304
    // kommt ohne Typ und ohne Cache-Angabe an und darf die Frische des
    // gespeicherten `immutable`-Eintrags nicht auf eine Stunde herabsetzen.
    const headers = rewriteResponseHeaders({ etag: '"77d67bda"' }, "/hermes", { method: "GET", resourcePath: "/assets/index-BqKNhaVF.js" });
    expect(headers["cache-control"]).toBeUndefined();
  });

  it("behandelt eine Anfrage mit Query-String am API-Pfad als API-Pfad", () => {
    // `proxyHttp` trennt den Query-String vor der Prüfung; `/api?x=1` darf nicht
    // als statische Datei durchrutschen.
    const resourcePath = "/api?x=1".split("?")[0] ?? "";
    expect(resourcePath).toBe("/api");
    const headers = rewriteResponseHeaders({ "content-type": "application/json", etag: '"abc"' }, "/hermes", { method: "GET", resourcePath });
    expect(headers["cache-control"]).toBeUndefined();
  });

  it("cacht auch bei HEAD, weil der Datei-Mount dieselben Header liefert", () => {
    const headers = rewriteResponseHeaders({ "content-type": "font/woff2", etag: '"abc"' }, "/hermes", { method: "HEAD", resourcePath: "/fonts-terminal/JetBrainsMono-Regular.woff2" });
    expect(headers["cache-control"]).toBe("private, max-age=3600");
  });
});
