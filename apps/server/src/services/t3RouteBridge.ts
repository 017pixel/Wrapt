/**
 * Clientseitige Route-Bridge für das eingebettete T3 Code.
 *
 * Das Skript wird vom T3-Proxy same-origin in das T3-HTML injiziert und läuft
 * im iframe: Es entfernt das `/t3`-Präfix vor dem Router-Start, meldet den
 * geöffneten Thread an die Workbench und hält Zurück im iframe T3-intern.
 * Das Server-Gegenstück (HTTP/WebSocket-Proxy) bleibt in `t3Proxy.ts`.
 */

/**
 * T3 Code läuft hinter dem Workbench-Präfix `/t3`, seine Browser-Routen liegen
 * aber am Root (`/$environmentId/$threadId`). Bei einem Deep-Link muss das
 * Präfix deshalb vor dem Router-Start aus der sichtbaren URL entfernt werden.
 * Frühere Workbench-Versionen erzeugten Tiefenlinks unter dem `/_chat`-Layout;
 * diese werden zusätzlich auf die Root-Thread-Route umgeschrieben.
 *
 * Die Bridge meldet außerdem den aktuell geöffneten T3-Thread nach oben:
 * Im iframe an die Workbench per `postMessage`, im eigenständigen Fenster
 * direkt per `PUT /api/v1/notifications/presence`. So gelten Benachrichtigungen
 * für einen Thread als gesehen, sobald der Nutzer genau diesen Chat öffnet.
 */
export const t3RouteBridgeScript = `<script data-wrapt-t3-route="1">
(() => {
  if (window.__wraptT3Bridge) return;
  window.__wraptT3Bridge = true;
  const prefix = "/t3";
  const pathname = window.location.pathname;
  if (pathname === prefix || pathname.startsWith(prefix + "/")) {
    const nextPath = pathname.slice(prefix.length) || "/";
    // Die T3-Thread-Route liegt am Root (/$environmentId/$threadId). Alte
    // Tiefenlinks unter dem /_chat-Layout (/_chat/<environmentId>/<threadId>
    // aus früheren Workbench-Versionen) werden vor dem Router-Start auf die
    // korrekte Form umgeschrieben. UUID-Paare sind eindeutig.
    const segments = nextPath.split("/").filter(Boolean);
    const legacyChatThread = segments.length >= 3
      && segments[0] === "_chat"
      && /^[0-9a-fA-F-]{36}$/.test(segments[1] ?? "")
      && /^[0-9a-fA-F-]{36}$/.test(segments[2] ?? "");
    const normalized = legacyChatThread ? "/" + segments.slice(1).join("/") : nextPath;
    window.history.replaceState(window.history.state, "", normalized + window.location.search + window.location.hash);
  }
  const historyIndexKey = "__wraptT3Index";
  let historyIndex = Number.isInteger(window.history.state?.[historyIndexKey]) ? window.history.state[historyIndexKey] : 0;
  window.history.replaceState({ ...window.history.state, [historyIndexKey]: historyIndex }, "", window.location.href);
  const here = () => window.location.pathname + window.location.search + window.location.hash;
  // Eigener Stapel der T3-Routen: Zurück im iframe darf nie die Workbench
  // treffen. Der Browserverlauf verzahnt iframe- und Workbench-Einträge —
  // nach einem Workbench-Seitenwechsel läge hinter Zurück sonst die
  // Workbench-Seite statt der vorherigen T3-Route. Darum navigiert Zurück bei
  // gefülltem Stapel explizit zur vorherigen T3-Route (replace + popstate für
  // den T3-Router), statt den gemeinsamen Verlauf zu traversieren.
  const routeStack = [here()];
  const presence = () => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    // Threads liegen am Root (/$environmentId/$threadId); ältere Pfade unter
    // dem _chat-Layout gelten als /_chat/<environmentId>/<threadId>.
    const threadId = segments[0] === "_chat" ? segments[2] ?? null : segments.length >= 2 ? segments[1] ?? null : null;
    return { source: "t3", threadId };
  };
  const report = () => {
    const path = window.location.pathname + window.location.search + window.location.hash;
    if (window.parent === window) {
      try {
        fetch("/api/v1/notifications/presence", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(presence()) });
      } catch { /* Presence ist Best Effort. */ }
    } else {
      window.parent.postMessage({ source: "wrapt-t3", version: 1, type: "route.changed", path }, window.location.origin);
    }
  };
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  const originalGo = history.go.bind(history);
  history.pushState = function (state, title, url) {
    historyIndex += 1;
    const result = originalPushState({ ...state, [historyIndexKey]: historyIndex }, title, url);
    routeStack.push(here());
    report();
    return result;
  };
  history.replaceState = function (state, title, url) {
    const result = originalReplaceState({ ...state, [historyIndexKey]: historyIndex }, title, url);
    routeStack[routeStack.length - 1] = here();
    report();
    return result;
  };
  history.go = function (delta) {
    if (window.parent !== window && typeof delta === "number" && delta < 0 && historyIndex + delta < 0) return;
    originalGo(delta);
  };
  history.back = function () {
    if (window.parent !== window && routeStack.length > 1) {
      routeStack.pop();
      const previous = routeStack[routeStack.length - 1];
      historyIndex = Math.max(0, historyIndex - 1);
      originalReplaceState({ ...window.history.state, [historyIndexKey]: historyIndex }, "", previous);
      report();
      dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      return;
    }
    history.go(-1);
  };
  addEventListener("popstate", (event) => {
    const nextIndex = event.state?.[historyIndexKey];
    if (Number.isInteger(nextIndex)) historyIndex = nextIndex;
    const current = here();
    const known = routeStack.lastIndexOf(current);
    if (known >= 0) routeStack.length = known + 1;
    else routeStack.push(current);
    report();
  });
  addEventListener("focus", report);
  report();
})();
</script>`;
