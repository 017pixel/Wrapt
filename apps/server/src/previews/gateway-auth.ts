import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../utils/errors.js";
import type { SlotRoute } from "./routing.js";
import type { HeaderBag } from "./gateway.js";

/**
 * Auth- und Härtungshelfer des Preview-Gateways (S-005, S-012).
 *
 * Der Datenpfad (Slot-Listener) kennt keine Workbench-Identität: Er läuft auf
 * Loopback hinter Tailscale Serve und sieht jeden Tab als 127.0.0.1. Deshalb
 * gelten hier drei Regeln:
 *
 * 1. Slot-Token: Wer eine Session über die Management-API besitzt, erhält ein
 *    unerratbares Token (`?slotToken`, HMAC über die Session-ID). Der Listener
 *    prüft es in `resolveRoute`. Falsche Token werden immer abgewiesen; fehlende
 *    nur im strikten Modus (`requireSlotToken`), weil die Workbench-Oberfläche
 *    (apps/web, eingefroren) das Token noch nicht an Slot-URLs hängt. Strikter
 *    Modus ohne Frontend-Anpassung würde alle Previews brechen.
 * 2. Cookies mit `Domain=localhost` gelten hostweit für alle Slots und werden
 *    fail-closed entfernt statt nur protokolliert.
 * 3. Externe `Location`/`Link`-Ziele des Devservers werden nicht still
 *    durchgereicht, sondern auf eine Warnseite der Slot-Origin umgeschrieben.
 */

export const SLOT_TOKEN_QUERY = "slotToken";
export const SLOT_TOKEN_HEADER = "x-preview-slot-token";

/** Leitet aus Geheimnis und Session-ID das unerratbare Slot-Token ab. */
export function deriveSlotToken(secret: string, sessionId: string): string {
  return createHmac("sha256", secret).update(`preview-slot:${sessionId}`).digest("hex");
}

/** Liest das Slot-Token aus Query oder Header, ohne andere Parameter anzufassen. */
export function extractSlotToken(rawUrl: string, headers: HeaderBag): string | null {
  const header = headers[SLOT_TOKEN_HEADER];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (typeof headerValue === "string" && headerValue.length > 0) return headerValue;
  const queryStart = rawUrl.indexOf("?");
  if (queryStart < 0) return null;
  for (const part of rawUrl.slice(queryStart + 1).split("&")) {
    const separator = part.indexOf("=");
    const name = separator < 0 ? part : part.slice(0, separator);
    if (name === SLOT_TOKEN_QUERY) {
      const value = separator < 0 ? "" : decodeURIComponent(part.slice(separator + 1));
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function tokensEqual(expected: string, given: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/**
 * Prüft den Slot-Zugriff vor dem Proxy. Wirft 403 bei falschem oder (im
 * strikten Modus) fehlendem Token. Routen ohne eindeutige Session (manuelle
 * Direktzuweisung, geteilte Kontexte) bleiben ohne Token erreichbar — sie
 * tragen bewusst keine Besitzbindung.
 */
export function assertSlotAccess(route: SlotRoute, rawUrl: string, headers: HeaderBag, options: {
  secret?: string;
  requireToken?: boolean;
}): void {
  if (route.sessionId === null) return;
  const token = extractSlotToken(rawUrl, headers);
  if (!token) {
    if (options.requireToken) {
      throw new AppError(403, "PREVIEW_SLOT_TOKEN_REQUIRED", "Diese Preview-Sitzung verlangt ein Slot-Token.");
    }
    return;
  }
  if (!options.secret || !tokensEqual(deriveSlotToken(options.secret, route.sessionId), token)) {
    throw new AppError(403, "PREVIEW_SLOT_TOKEN_INVALID", "Das Slot-Token ist ungültig.");
  }
}

/** Meldet `Domain=localhost`-Cookies, ohne sie still umzuschreiben. */
export function cookieDomainWarnings(setCookie: string | string[] | undefined): string[] {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return values
    .filter((cookie) => /;\s*domain\s*=\s*(localhost|127\.0\.0\.1)\s*(;|$)/i.test(cookie))
    .map((cookie) => cookie.split(";")[0]?.split("=")[0]?.trim() ?? "cookie");
}

function isHostWideCookie(cookie: string): boolean {
  return /;\s*domain\s*=\s*(localhost|127\.0\.0\.1)\s*(;|$)/i.test(cookie);
}

/**
 * Entfernt hostweite Cookies fail-closed. Der Aufrufer protokolliert die
 * entfernten Namen als Diagnose, damit ein Devserver mit Login-Session nicht
 * still seine Sitzung über alle Slots teilt.
 */
export function sanitizeSlotCookies(setCookie: string | string[] | undefined): {
  kept: string | string[] | undefined;
  removed: string[];
} {
  if (setCookie === undefined) return { kept: undefined, removed: [] };
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const kept = values.filter((cookie) => !isHostWideCookie(cookie));
  const removed = cookieDomainWarnings(setCookie);
  if (!Array.isArray(setCookie)) {
    return { kept: kept[0], removed };
  }
  return { kept, removed };
}

function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(hostname.toLowerCase());
}

/**
 * Erkennt stille Extern-Redirects: absolute http(s)-Ziele, die weder Loopback
 * sind noch zu einer bekannten Slot-Origin aus dem Mapping gehören.
 */
export function isExternalRedirectTarget(value: string, mapping: Record<string, string>): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (isLoopbackHostname(url.hostname)) return false;
  return !Object.values(mapping).some((origin) => {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  });
}

/** Pfad der Warnseite für externe Redirects innerhalb der Slot-Origin. */
export const EXTERNAL_REDIRECT_WARN_ROUTE = "/__wrapt/externer-link";

/** Baut die Warn-URL für ein externes Ziel (Click-through statt Stillem Redirect). */
export function externalRedirectWarnUrl(target: string): string {
  return `${EXTERNAL_REDIRECT_WARN_ROUTE}?ziel=${encodeURIComponent(target)}`;
}

/** Warnseite: zeigt das externe Ziel und verlangt einen bewussten Klick. */
export function externalRedirectWarnPage(target: string): string {
  const escaped = target.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><title>Externer Link aus der Vorschau</title></head><body>"
    + "<p style=\"font:14px sans-serif\">Der Entwicklungs-Server möchte auf eine externe Adresse weiterleiten:</p>"
    + `<p style="font:14px sans-serif"><code>${escaped}</code></p>`
    + `<p style="font:14px sans-serif"><a href="${escaped}">Trotzdem öffnen</a> — prüfe die Adresse, bevor du klickst.</p>`
    + "</body></html>";
}

/**
 * Verständliche 502-Seite, wenn der Zielport nicht antwortet. Sie lädt sich mit
 * einem Zähler im sessionStorage der Slot-Origin begrenzt selbst neu, damit das
 * Preview nach einem automatischen Devserver-Neustart ohne Nutzereingriff
 * wiederkommt. Nach zehn Versuchen stoppt der Reload; ein späteres manuelles
 * Neuladen startet frisch.
 */
export function devServerDownPage(): string {
  return "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><title>Preview nicht erreichbar</title>"
    + "<script>"
    + "(function(){"
    + "try{"
    + "var key='wrapt:preview-retry';"
    + "var raw=window.sessionStorage.getItem(key);"
    + "var now=Date.now();"
    + "var attempt=0;"
    + "if(raw){try{var state=JSON.parse(raw);"
    + "if(state&&typeof state.n==='number'&&typeof state.at==='number'&&now-state.at<120000)attempt=state.n+1;"
    + "}catch(e){attempt=0}}"
    + "if(attempt<10){window.sessionStorage.setItem(key,JSON.stringify({n:attempt,at:now}));"
    + "window.setTimeout(function(){window.location.reload()},5000);"
    + "}else{window.sessionStorage.removeItem(key)}"
    + "}catch(e){}"
    + "})();"
    + "</script>"
    + "</head><body>"
    + "<p style=\"font:14px sans-serif\">Der Entwicklungs-Server antwortet gerade nicht. "
    + "Die Workbench versucht, ihn automatisch neu zu starten; diese Seite lädt sich selbst neu.</p>"
    + "</body></html>";
}
