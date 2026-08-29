/**
 * Basis-Adresse für End-to-End-Tests.
 *
 * Ohne `WRAPT_E2E_URL` läuft alles gegen die lokale Wrapt auf
 * `127.0.0.1:3010` — die startet Playwright bei Bedarf selbst (siehe `webServer`
 * in `playwright.config.ts`). `WRAPT_E2E_URL` zeigt immer auf den reinen
 * Origin des Testservers; diese Adresse ergänzt den Basispfad `/wrapt`,
 * unter dem das Frontend ausgeliefert wird.
 *
 * Manche Tests brauchen mehr als einen laufenden Server: eine Instanz mit den
 * erwarteten Projekten, eine Tailscale-Identität für PTY-Sitzungen oder
 * synchronisierte News samt API-Schlüssel. Diese Tests prüfen
 * `hasPrivateWrapt` und überspringen sich, statt mit
 * `ERR_NAME_NOT_RESOLVED` zu scheitern und den Lauf rot zu färben.
 */
// Der isolierte E2E-Server liefert reproduzierbare Fixture-Daten, aber nicht
// die private Produktionsumgebung mit allen Projekten, Accounts und News.
// Private-only-Suiten dürfen deshalb nicht allein wegen einer Test-URL laufen.
export const hasPrivateWrapt = Boolean(process.env.WRAPT_E2E_URL)
  && process.env.WRAPT_E2E_ISOLATED !== "true";

export const workbenchUrl = `${(process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010").replace(/\/$/, "")}/wrapt`;

/** Begründung für übersprungene Tests, die eine eingerichtete Instanz voraussetzen. */
export const privateWraptReason =
  "Setze WRAPT_E2E_URL auf eine eingerichtete Wrapt (Projekte, Tailscale-Identität, Dienste).";

/**
 * Identitäts-Header für API-Zugriffe über `page.request`/`context.request`.
 * Playwright sendet `extraHTTPHeaders` nur für Browser-Requests, nicht für die
 * API-Request-Kontexte — die Server-Authentifizierung verlangt die Identität
 * aber überall, also muss sie hier explizit mitgegeben werden.
 */
export function apiIdentityHeaders(login: string): Record<string, string> {
  return { "tailscale-user-login": login };
}
