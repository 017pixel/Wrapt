// T3 Code öffnet „Open in …" im Web als `vscode://vscode-remote/
// ssh-remote+<host><pfad>`-Deep-Link über `window.location.assign`. Ohne
// registrierten Schema-Handler bleibt dieser Klick wirkungslos. Die URL selbst
// lässt sich nicht abfangen: `window.location.assign` ist in Chrome und
// Firefox eine nicht überschreibbare Browser-Property. Das Script fängt
// deshalb den Klick auf alle T3-„Open"-Einträge ab (kompakter Toolbar-Button,
// Panel-Zeile „Open in …" im Thread-Details-Panel, Menüeinträge), liest den
// Zielordner aus den
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
  // Die Thread-Details-Fläche trägt seit dem Nightly-Umbau das Attribut
  // data-thread-details-panel (inline als <aside>, als Popover in einem
  // role="dialog"); ältere Versionen nutzten die Klasse thread-details-action.
  const inMenu = (element) => !!element.closest('[role="menu"], [role="dialog"], [data-thread-details-panel], [class*="thread-details-action"]');
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
    const element = target instanceof Element ? target.closest("button, [role=menuitem]") : null;
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
