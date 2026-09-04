import { describe, expect, it } from "vitest";
import { t3RouteBridgeScript } from "./t3RouteBridge.js";

describe("T3-Route-Bridge", () => {
  it("normalisiert Deep-Links auf den T3-Thread vor dem Router-Start", () => {
    expect(t3RouteBridgeScript).toContain('pathname.startsWith(prefix + "/")');
    expect(t3RouteBridgeScript).toContain("history.replaceState");
    expect(t3RouteBridgeScript).toContain('pathname.slice(prefix.length)');
    // Alte Tiefenlinks unter dem _chat-Layout werden auf die Root-Thread-Route umgeschrieben
    expect(t3RouteBridgeScript).toContain('segments[0] === "_chat"');
    expect(t3RouteBridgeScript).toContain("[0-9a-fA-F-]{36}$");
  });

  it("meldet den geöffneten T3-Thread an die Workbench beziehungsweise den Server", () => {
    expect(t3RouteBridgeScript).toContain('source: "wrapt-t3"');
    expect(t3RouteBridgeScript).toContain('type: "route.changed"');
    expect(t3RouteBridgeScript).toContain("window.parent.postMessage");
    expect(t3RouteBridgeScript).toContain("/api/v1/notifications/presence");
    // Threads liegen am Root: /$environmentId/$threadId (ältere _chat-Pfade werden mitgelesen)
    expect(t3RouteBridgeScript).toContain('segments[0] === "_chat" ? segments[2] ?? null : segments.length >= 2 ? segments[1] ?? null : null');
    expect(t3RouteBridgeScript).toContain('addEventListener("focus", report)');
  });

  it("begrenzt den eingebetteten T3-Verlauf auf das iframe", () => {
    expect(t3RouteBridgeScript).toContain("__wraptT3Index");
    expect(t3RouteBridgeScript).toContain("historyIndex + delta < 0");
    // Zurück navigiert bei gefülltem Stapel explizit T3-intern, damit der
    // verzahnte Browserverlauf nicht in die Workbench springt.
    expect(t3RouteBridgeScript).toContain("routeStack.length > 1");
    expect(t3RouteBridgeScript).toContain('new PopStateEvent("popstate"');
  });

  it("führt die Bridge nur einmal je Dokument aus", () => {
    expect(t3RouteBridgeScript).toContain("__wraptT3Bridge");
  });

  it("hält Zurück im iframe T3-intern statt in die Workbench zu springen", () => {
    const historyIndexKey = "__wraptT3Index";
    const listeners = new Map<string, Array<(event: { type: string; state?: unknown }) => void>>();
    const posted: unknown[] = [];
    const goCalls: number[] = [];
    let href = "http://workbench.local/t3/";
    const parent = { postMessage: (message: unknown) => { posted.push(message); } };
    const locationStub = {
      get pathname() { return new URL(href).pathname; },
      get search() { return new URL(href).search; },
      get hash() { return new URL(href).hash; },
      get href() { return href; },
      get origin() { return "http://workbench.local"; },
    };
    const entries: Array<{ state: Record<string, unknown>; url: string }> = [{ state: {}, url: href }];
    let index = 0;
    const historyStub = {
      get state() { return entries[index]!.state; },
      pushState(state: Record<string, unknown>, _title: string, url?: string) {
        const next = url === undefined ? href : new URL(url, href).toString();
        entries.length = index + 1;
        entries.push({ state, url: next });
        index += 1;
        href = next;
      },
      replaceState(state: Record<string, unknown>, _title: string, url?: string) {
        const next = url === undefined ? href : new URL(url, href).toString();
        entries[index] = { state, url: next };
        href = next;
      },
      go(delta: number) { goCalls.push(delta); },
      back() { throw new Error("Die Bridge muss history.back ersetzen."); },
      forward() { /* Nicht Teil dieses Tests. */ },
    };
    const windowStub = { history: historyStub, location: locationStub, parent, __wraptT3Bridge: undefined as unknown } as typeof globalThis & {
      history: typeof historyStub;
      location: typeof locationStub;
      parent: unknown;
      __wraptT3Bridge: unknown;
    };
    class PopStateEventStub {
      type: string;
      state: unknown;
      constructor(type: string, init?: { state?: unknown }) {
        this.type = type;
        this.state = init?.state;
      }
    }
    const addEventListener = (type: string, listener: (event: { type: string; state?: unknown }) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    const dispatchEvent = (event: { type: string; state?: unknown }) => {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    };
    const source = t3RouteBridgeScript.replace(/^<script[^>]*>/, "").replace(/<\/script>\s*$/, "");
    const run = new Function("window", "history", "addEventListener", "dispatchEvent", "PopStateEvent", "fetch", source) as (
      ...args: unknown[]
    ) => void;
    const nativeReplace = historyStub.replaceState.bind(historyStub);
    run(windowStub, historyStub, addEventListener, dispatchEvent, PopStateEventStub, () => { throw new Error("fetch ist eingebettet unerwartet"); });
    // Das /t3-Präfix wird vor dem Router-Start entfernt.
    expect(new URL(href).pathname).toBe("/");
    // Erneutes Einbetten startet die Bridge nicht neu.
    run(windowStub, historyStub, addEventListener, dispatchEvent, PopStateEventStub, () => { throw new Error("fetch ist eingebettet unerwartet"); });
    expect(listeners.get("popstate")).toHaveLength(1);

    historyStub.pushState({}, "", "/settings");
    historyStub.pushState({}, "", "/usage");
    expect(posted.at(-1)).toMatchObject({ type: "route.changed", path: "/usage" });

    // Erstes Zurück: explizit nach /settings, ohne den gemeinsamen Verlauf.
    historyStub.back();
    expect(new URL(href).pathname).toBe("/settings");
    expect(goCalls).toHaveLength(0);
    expect(posted.at(-1)).toMatchObject({ type: "route.changed", path: "/settings" });

    // Zweites Zurück: explizit zur Startseite.
    historyStub.back();
    expect(new URL(href).pathname).toBe("/");
    expect(goCalls).toHaveLength(0);

    // Auf der ersten T3-Route bleibt Zurück im iframe statt in die Workbench.
    historyStub.back();
    expect(new URL(href).pathname).toBe("/");
    expect(goCalls).toHaveLength(0);

    // Echte Browser-Traversalen im iframe synchronisieren Stapel und Zähler.
    nativeReplace({ [historyIndexKey]: 1 }, "", "/settings");
    dispatchEvent(new PopStateEventStub("popstate", { state: { [historyIndexKey]: 1 } }));
    historyStub.back();
    expect(new URL(href).pathname).toBe("/");
    expect(goCalls).toHaveLength(0);
  });
});
