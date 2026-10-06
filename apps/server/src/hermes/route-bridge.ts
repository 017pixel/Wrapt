/**
 * Injizierte Brücke zwischen der Hermes-SPA im Iframe und der Workbench.
 *
 * Zwei Richtungen:
 *  - `route.changed` nach oben, damit die Workbench die zuletzt besuchte Seite
 *    merken und die eigene Navigation mitmarkieren kann. Die SPA meldet ihre
 *    Route nicht von sich aus nach außen.
 *  - `route.navigate` nach unten, damit ein Klick in der Workbench-Navigation
 *    die SPA intern weiterroutet statt das Iframe neu zu laden. Ein `src`-Wechsel
 *    würde die komplette SPA samt Verbindungen neu aufbauen — sichtbar als
 *    Sekunden von Ladezustand bei jedem Seitenwechsel.
 *
 * Fällt die Injektion aus (etwa weil Hermes sein HTML ändert), degradiert
 * beides still: Die Workbench bleibt auf der Startseite und lädt bei einem
 * Seitenwechsel das Iframe neu.
 *
 * Zusätzlich ein Dropdown-Notbehelf: Der Hermes-eigene Select rendert seine
 * Liste absolut im Auslöser-Container, ohne Portal. Sitzt der Select in einem
 * kurzen Scroll-Container (etwa die Reasoning-Auswahl in der Chat-Seite),
 * öffnet die Liste nach unten in den abgeschnittenen Überlauf — sichtbar
 * passiert nichts außer dem gedrehten Chevron. Der Notbehelf erkennt genau
 * diesen Fall und stellt nur dann auf `fixed` um, mit Aufklappen nach oben
 * als Rückweg. Ungeklemmte Listen fasst er nicht an. Knoten werden nie
 * verschoben, nur inline positioniert, damit React sie normal aushängen kann.
 */
export function routeBridgeScript(): string {
  return `<script data-wrapt-hermes-bridge="1">(() => {
  let hostActive = true;
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = (callback, delay, ...args) => nativeSetInterval((...values) => {
    if (hostActive) callback(...values);
  }, delay, ...args);
  const here = () => location.pathname + location.search + location.hash;
  const notify = () => window.parent.postMessage({source:"wrapt-hermes",version:1,type:"route.changed",path:here()}, location.origin);
  for (const name of ["pushState","replaceState"]) { const original = history[name]; history[name] = function (...args) { const result = original.apply(this, args); notify(); return result; }; }
  addEventListener("popstate", notify); addEventListener("hashchange", notify);
  addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "wrapt-hermes" || data.version !== 1) return;
    if (data.type === "host.activity" && typeof data.active === "boolean") {
      const changed = hostActive !== data.active;
      hostActive = data.active;
      if (changed && hostActive) dispatchEvent(new Event("focus"));
      return;
    }
    if (data.type !== "route.navigate" || typeof data.path !== "string") return;
    if (!data.path.startsWith("/") || data.path.includes("..") || data.path.startsWith("//")) return;
    if (data.path === here()) return;
    history.pushState({}, "", data.path);
    dispatchEvent(new PopStateEvent("popstate", {state: {}}));
  });
  notify();
  try {
    const portalFlag = "wraptDropdownPortal";
    const nearestClip = (node) => {
      let top = 0; let bottom = window.innerHeight; let left = 0; let right = window.innerWidth;
      let el = node.parentElement;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const rect = el.getBoundingClientRect();
          if (style.overflowY !== "visible") { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
          if (style.overflowX !== "visible") { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
        }
        el = el.parentElement;
      }
      return { top, bottom, left, right };
    };
    const portalize = () => {
      try {
        const boxes = document.querySelectorAll('[role="listbox"]');
        for (const box of boxes) {
          if (!(box instanceof HTMLElement)) continue;
          const wrap = box.parentElement;
          const trigger = wrap ? wrap.querySelector('[role="combobox"]') : null;
          if (!(trigger instanceof HTMLElement)) { continue; }
          const rect = box.getBoundingClientRect();
          if (rect.height <= 0) continue;
          const clip = nearestClip(box);
          const clipped = rect.bottom > clip.bottom + 1 || rect.right > clip.right + 1 || rect.top < clip.top - 1;
          if (!clipped) {
            if (box.dataset[portalFlag]) {
              delete box.dataset[portalFlag];
              box.style.position = ""; box.style.top = ""; box.style.left = "";
              box.style.width = ""; box.style.maxHeight = ""; box.style.zIndex = "";
              box.style.marginTop = "";
            }
            continue;
          }
          const anchor = trigger.getBoundingClientRect();
          const listHeight = Math.min(box.scrollHeight || rect.height || 240, 240);
          const gap = 4;
          const spaceBelow = window.innerHeight - anchor.bottom - gap;
          const spaceAbove = anchor.top - gap;
          const openUp = spaceBelow < Math.min(listHeight, 120) && spaceAbove > spaceBelow;
          box.dataset[portalFlag] = "1";
          box.style.position = "fixed";
          box.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - anchor.width - 8)) + "px";
          box.style.width = anchor.width + "px";
          box.style.zIndex = "90";
          box.style.marginTop = "0";
          if (openUp) {
            box.style.top = Math.max(8, anchor.top - Math.min(listHeight, spaceAbove) - gap) + "px";
            box.style.maxHeight = Math.min(listHeight, Math.max(spaceAbove, 80)) + "px";
          } else {
            box.style.top = (anchor.bottom + gap) + "px";
            box.style.maxHeight = Math.min(listHeight, Math.max(spaceBelow, 80)) + "px";
          }
        }
      } catch { /* Notbehelf darf die SPA nie stören. */ }
    };
    const observer = new MutationObserver(portalize);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("scroll", portalize, { capture: true, passive: true });
    addEventListener("resize", portalize);
    portalize();
  } catch { /* Ohne den Notbehelf läuft die Brücke wie bisher weiter. */ }
})();</script>`;
}
