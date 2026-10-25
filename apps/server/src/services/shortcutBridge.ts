/**
 * Frühe, synchrone Tastatur-Anbindung kontrollierter Werkzeugdokumente.
 * Die Workbench entscheidet selbst über die Belegung. Nur tatsächlich dort
 * behandelte Ereignisse werden vor den Listenern des Werkzeugs gestoppt.
 */
export const shortcutBridgeScript = `<script data-wrapt-shortcuts="1">
(() => {
  if (window.parent === window || window.__wraptShortcutBridge) return;
  window.__wraptShortcutBridge = true;
  const consumed = new Set();
  const relay = (event) => {
    // Das Werkzeug kann nach der Navigation bereits geparkt sein. Folgeereignisse
    // trotzdem lokal abfangen, auch wenn der Host den Frame nicht mehr akzeptiert.
    if ((event.type !== "keydown" || event.repeat) && consumed.has(event.code)) {
      if (event.type === "keyup") consumed.delete(event.code);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.type === "keydown") consumed.delete(event.code);
    try {
      const message = new window.parent.CustomEvent("wrapt:shortcut-frame", {
        detail: { source: window, event }
      });
      window.parent.dispatchEvent(message);
      if (event.type === "keydown" && event.defaultPrevented) consumed.add(event.code);
    } catch { /* Fremde Origins bleiben vollständig beim eingebetteten Werkzeug. */ }
  };
  for (const type of ["keydown", "keyup", "keypress"]) window.addEventListener(type, relay, true);
  const reset = () => {
    try {
      window.parent.dispatchEvent(new window.parent.CustomEvent("wrapt:shortcut-frame", {
        detail: { source: window, reset: true }
      }));
    } catch { /* Keine zugängliche Workbench. */ }
  };
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); });
})();</script>`;

/** Bestehende Script-Nonces verwenden; CSP wird weder entfernt noch gelockert. */
export function injectShortcutBridge(html: string, nonce?: string): string {
  if (html.includes('data-wrapt-shortcuts="1"')) return html;
  const existingNonce = nonce ?? /<script\b[^>]*\bnonce=["']([^"']+)["']/i.exec(html)?.[1];
  const script = existingNonce && /^[\w+/=-]+$/.test(existingNonce)
    ? shortcutBridgeScript.replace("<script ", `<script nonce="${existingNonce}" `) : shortcutBridgeScript;
  // Vor dem ersten App-Script registrieren, damit dessen Shortcuts nicht zuerst feuern.
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (head) => head + script)
    : script + html;
}
