/**
 * Basis-Adresse für End-to-End-Tests.
 *
 * Ohne `WRAPT_E2E_URL` nutzt die Suite `WRAPT_E2E_PORT` oder den Standardport
 * 3010. Playwright startet bei Bedarf dort einen isolierten Testserver (siehe
 * `webServer` in `playwright.config.ts`). `WRAPT_E2E_URL` zeigt auf den reinen
 * Origin einer explizit eingerichteten Testinstanz. Diese Adresse ergänzt den
 * Basispfad `/wrapt`, unter dem das Frontend ausgeliefert wird.
 *
 * Tests verwenden ausschließlich temporäre Projekte und erlaubte
 * Testidentitäten der isolierten Instanz.
 */

const e2eOrigin = process.env.WRAPT_E2E_URL
  ?? `http://127.0.0.1:${process.env.WRAPT_E2E_PORT ?? 3010}`;

export const workbenchUrl = `${e2eOrigin.replace(/\/$/, "")}/wrapt`;

/**
 * Identitäts-Header für API-Zugriffe über `page.request`/`context.request`.
 * Playwright sendet `extraHTTPHeaders` nur für Browser-Requests, nicht für die
 * API-Request-Kontexte — die Server-Authentifizierung verlangt die Identität
 * aber überall, also muss sie hier explizit mitgegeben werden.
 */
export function apiIdentityHeaders(login: string): Record<string, string> {
  return { "tailscale-user-login": login };
}
