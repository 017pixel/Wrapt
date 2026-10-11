import { describe, expect, it } from "vitest";
import { injectT3HtmlBridge, remoteEditorFallbackScript, t3HttpRoutes, t3IsEditorOpenButton, t3OpenInCwdFromFiber, t3WebSocketRoutes } from "./t3Proxy.js";

describe("T3-Proxy", () => {
  it("leitet gespeicherte Bildanhänge an T3 weiter", () => {
    expect(t3HttpRoutes).toContain("/api/assets/*");
  });

  it("leitet Bild-Uploads (rohe Bytes per XHR) an T3 weiter", () => {
    expect(t3HttpRoutes).toContain("/api/attachments/*");
  });

  it("leitet Pull-Request-Diffs und das Webmanifest an T3 weiter", () => {
    expect(t3HttpRoutes).toContain("/api/pull-requests/*");
    expect(t3HttpRoutes).toContain("/manifest.webmanifest");
  });

  it("leitet die T3-API-Gruppen für Threads und Connect weiter", () => {
    expect(t3HttpRoutes).toContain("/api/orchestration/*");
    expect(t3HttpRoutes).toContain("/api/connect/*");
    expect(t3HttpRoutes).toContain("/api/t3-connect/*");
    expect(t3HttpRoutes).toContain("/api/observability/*");
    expect(t3HttpRoutes).toContain("/oauth/*");
  });

  it("leitet den Browser-Stream der integrierten Browser-Fläche weiter", () => {
    // Die Fläche verbindet per WebSocket auf /api/preview-stream/ws. Ohne
    // diese Route antwortet der Proxy mit 404 („Browser connection was refused").
    expect(t3HttpRoutes).toContain("/api/preview-stream/*");
    expect(t3WebSocketRoutes).toContain("/ws");
    expect(t3WebSocketRoutes).toContain("/api/preview-stream/*");
  });

  it("brückt alle T3-Open-Einträge auf die Code-Editor-Seite der Workbench", () => {
    expect(remoteEditorFallbackScript).toContain("wrapt:open-editor");
    expect(remoteEditorFallbackScript).toContain("=== \"Open file in preferred editor\"");
    expect(remoteEditorFallbackScript).toContain("[data-chat-header-actions]");
    expect(remoteEditorFallbackScript).toContain("__reactFiber$");
    expect(remoteEditorFallbackScript).toContain("window.parent.postMessage");
    expect(remoteEditorFallbackScript).toContain("/wrapt/code-editor/");
    expect(remoteEditorFallbackScript).toContain("[role=menuitem]");
    expect(remoteEditorFallbackScript).toContain("thread-details-action");
    // Nightly rendert die Thread-Details inline als <aside data-thread-details-panel>.
    expect(remoteEditorFallbackScript).toContain("[data-thread-details-panel]");
    expect(remoteEditorFallbackScript).toContain("startsWith(\"Open in \")");
    // Hover und Fokus laden das Editor-Dokument einmalig vor.
    expect(remoteEditorFallbackScript).toContain("rel = \"prefetch\"");
    expect(remoteEditorFallbackScript).toContain("\"mouseover\"");
    expect(remoteEditorFallbackScript).toContain("\"focusin\"");
    expect(remoteEditorFallbackScript).toContain("matchesOpenButton");
    // Die vscode://-URL ist nicht abfangbar (window.location.assign ist nicht
    // überschreibbar), also wird der Klick selbst unterbunden.
    expect(remoteEditorFallbackScript).toContain("addEventListener(\"click\", (event) => {");
    expect(remoteEditorFallbackScript).toContain("event.preventDefault()");
    expect(remoteEditorFallbackScript).toContain("openEditor(button)");
    expect(remoteEditorFallbackScript).not.toContain("Location.prototype.assign");
  });

  it("erkennt alle T3-Open-Varianten über aria-label, Text und Bereich", () => {
    expect(t3IsEditorOpenButton({ ariaLabel: "Open file in preferred editor", text: null, inHeaderActions: true, hasIcon: true, inMenu: false, isEntry: true })).toBe(true);
    expect(t3IsEditorOpenButton({ ariaLabel: null, text: "Open", inHeaderActions: true, hasIcon: true, inMenu: false, isEntry: true })).toBe(true);
    expect(t3IsEditorOpenButton({ ariaLabel: "Open in VS Code", text: null, inHeaderActions: false, hasIcon: true, inMenu: true, isEntry: true })).toBe(true);
    expect(t3IsEditorOpenButton({ ariaLabel: "Open in Cursor", text: null, inHeaderActions: true, hasIcon: true, inMenu: false, isEntry: true })).toBe(true);
    expect(t3IsEditorOpenButton({ ariaLabel: null, text: "Open", inHeaderActions: false, hasIcon: true, inMenu: false, isEntry: true })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: null, text: "Open", inHeaderActions: true, hasIcon: false, inMenu: false, isEntry: true })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: "Open in…", text: null, inHeaderActions: false, hasIcon: true, inMenu: true, isEntry: true })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: "Open in VS Code", text: null, inHeaderActions: false, hasIcon: true, inMenu: false, isEntry: true })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: "Open in VS Code", text: null, inHeaderActions: false, hasIcon: false, inMenu: true, isEntry: true })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: "Open in VS Code", text: null, inHeaderActions: false, hasIcon: true, inMenu: true, isEntry: false })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: "Copy options", text: "Open", inHeaderActions: true, hasIcon: true, inMenu: false, isEntry: true })).toBe(false);
  });

  it("liest den Zielordner aus den React-Props entlang der Fiber-Kette", () => {
    const element = {
      __reactFiber$abc: {
        memoizedProps: { type: "button", children: "Open" },
        return: {
          memoizedProps: {},
          return: {
            memoizedProps: { openInCwd: "/home/user/projects/Wrapt", environmentId: "env-1" },
            return: null,
          },
        },
      },
    };
    expect(t3OpenInCwdFromFiber(element)).toBe("/home/user/projects/Wrapt");
  });

  it("liefert ohne Fiber-Marker oder ohne openInCwd-Prop keinen Ordner", () => {
    expect(t3OpenInCwdFromFiber(null)).toBeNull();
    expect(t3OpenInCwdFromFiber({})).toBeNull();
    const element = {
      __reactFiber$abc: {
        memoizedProps: { onClick: () => undefined },
        return: null,
      },
    };
    expect(t3OpenInCwdFromFiber(element)).toBeNull();
  });

  it("löst beim Vorladen das Ziel-Element auf statt einer uninitialisierten Variable", () => {
    // Regression: `element.closest` im eigenen Initialisierer warf bei jedem
    // Hover und Fokus einen ReferenceError und brach das Prefetch ab.
    expect(remoteEditorFallbackScript).toContain("target.closest(\"button, [role=menuitem]\")");
    expect(remoteEditorFallbackScript).not.toContain("element.closest(\"button, [role=menuitem]\")");
  });

  it("unterbindet die vscode://-Navigation, die in Chrome und Firefox nicht abfangbar ist", () => {
    // Stattdessen setzt das Script auf Button-Interception um: Der Klick wird
    // in der Capture-Phase gestoppt, bevor T3 die tote Deep-Link-URL baut.
    expect(remoteEditorFallbackScript).toContain("addEventListener(\"click\", (event) => {");
    expect(remoteEditorFallbackScript).toContain("event.preventDefault()");
    expect(remoteEditorFallbackScript).toContain("openEditor(button)");
    expect(remoteEditorFallbackScript).not.toContain("Location.prototype.assign");
  });

  it("injiziert die Route-Bridge in T3-HTML auch bei Deep-Links", () => {
    const html = injectT3HtmlBridge("<!doctype html><html><head></head><body></body></html>");
    expect(html.indexOf('data-wrapt-t3-route="1"')).toBeGreaterThan(-1);
    expect(html.indexOf("wrapt:open-editor")).toBeGreaterThan(-1);
    expect(html.indexOf("</head>")).toBeGreaterThan(html.indexOf('data-wrapt-t3-route="1"'));
  });
});
