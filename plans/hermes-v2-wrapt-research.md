# Hermes V2: Wrapt-Bestand

Stand: 16.10.2026, Ausgangscommit `f6a45419`, Version 2.8.0.

## Bestehende Flächen und Schnittstellen

- `HermesShell.tsx` bindet ausschließlich `HermesAdminFrame` ein. Die SPA bleibt unverändert als klassische Verwaltung bestehen.
- Alle Einbettungen (Route, Panel, Orbit) verwenden dieselbe Shell. Die V2-Auswahl gehört daher vor diese Shell, ohne den bestehenden iframe-Code umzubauen.
- Der Router nutzt die Page-/Route-Registry. Neue V2- und Standalone-Routen werden in einem eigenen Feature-Modul registriert. Die eingefrorene `legacyPageRoutes.ts` darf nicht wachsen.
- `routeModules.ts` enthält Lazy-Loader; ein dynamischer Import hält V2-Code und Transport bei deaktiviertem Flag vom Chat-Einstieg fern.
- `appPreferences.ts` speichert bereits lokale UI-Präferenzen mit Zustand-Persistenz. Der neue boolesche Flag passt hier hinein, Standard false. Zusammenführung alter Daten muss false ergänzen, ohne die Startseite zu verlieren.
- `SettingsEasterEggs.tsx` bietet das bestehende Karten-/Switch-Muster. Eigene Hermes-V2-Karte und Suchkatalog-Eintrag ergänzen.
- `HermesDashboardClient` kapselt das bestehende Dashboard und serverseitige Tokens. `HermesSessionToken` liest das Token ausschließlich serverseitig aus dem Loopback-Dashboard.
- Bestehende REST-Routen liefern Sessions, History, Tasks, Cron, Results, Models, Status und Diagnose. V1 bleibt unangetastet.
- `HermesSessionService` normalisiert Sessions. Seine Zeitheuristik für `running` ist für V2-Arbeitszustände ungeeignet; V2 muss echte Gateway-Laufzustände verwenden.
- `HermesAcpManager` startet ACP-Unterprozesse. V2 soll stattdessen den bereits vorhandenen TUI-Gateway im Dashboard ansprechen und diese ACP-Implementierung nicht erweitern.
- `HermesResultSync` und die Benachrichtigungsdatenbank existieren bereits. V2-Ereignisse können in denselben Benachrichtigungskanal integriert werden; keine zweite Benachrichtigungswelt.
- Skills-Verwaltung kennt Hermes-Skills und globale Regeln bereits. V2 verlinkt dieselbe Seite und zeigt Katalogdaten aus Hermes.

## Sicherheit

- Globale Hooks schützen `/api/*` durch `resolveWorkbenchUser` und prüfen Same-Origin bei Browser-Mutationen.
- WebSocket-Routen müssen Identität und Origin zusätzlich ausdrücklich prüfen; V1 zeigt das Muster.
- `isSameOriginRequest` berücksichtigt den vertrauenswürdigen Proxy. V2 darf keine frei wählbare Upstream-URL erlauben.
- Projekt-CWDs werden gegen registrierte Projekte und erlaubte Roots geprüft. V2 muss zusätzlich Symlinks über reale Pfade auflösen.
- Bestehende Redaction entfernt sensible Schlüssel. Der V2-Adapter braucht getrennte Behandlung echter Secret-Antworten: nicht redigiert an Hermes senden, niemals in Events, Logs, Cache oder Persistenz übernehmen.
- Die Standalone-Fläche verwendet dieselben geschützten APIs; HTML allein darf keine Hermes-Daten enthalten.

## Historie

- `7005b7ece2bd23dd00b208f86db7fa4e669a4c81`: native Chat-, Composer-, Sidebar-, Cron-, Approval- und Tool-Komponenten vorhanden; Transport war ACP.
- `026bd3ec1c57131115547aa514e92c0d15ec9129`: Darstellungsschalter innerhalb der damaligen Shell.
- `9f7508ee15f8b655f4d8ca005422c39ce1c8fa59`: expliziter Umbau auf offizielle SPA, Entfernung von 1.767 Zeilen. Commit nennt keine tiefergehende Fehlerursache; solche Gründe dürfen nicht erfunden werden.
- Alte Chat-Hooks schließen den Socket beim Unmount und planen im Close-Handler erneut Reconnect; diese Lebenszykluslogik wird nicht übernommen.
- Gute bestehende Prinzipien: serverseitige Tokenkapselung, begrenzte Tooloutputs, stabile Message-IDs und explizite Approval-Optionen.

## Design und Verifikation

- Einzige Farbquelle: `@theme` in `index.css`, UI verwendet Wrapt-Tokens. Neue CSS-Dateien featurelokal importieren, keine Erweiterung der großen historischen Datei.
- `dompurify`, `marked` und `highlight.js` sind bereits installiert; keine neue Markdown-Abhängigkeit nötig.
- Neue handgeschriebene Dateien maximal 400 Zeilen. Historische Baselines nicht erhöhen.
- `playwright.config.ts` baut in ein separates temporäres Dist-Verzeichnis und startet einen isolierten Server. Nutzer-Previews und Produktions-Dist dürfen für Tests nicht überschrieben werden.
- Vorhandene V1-E2E-Specs `hermes.spec.ts` und `hermes-mobile.spec.ts` sichern den bisherigen iframe-Einstieg.
- Keine Commits, Pushes, Dienstneustarts, Konfigurationsänderungen an laufenden Instanzen oder echten Session-Löschungen im Rahmen der Implementierung.

## Phase-1-Dateimap

- Bestehend ändern: `stores/appPreferences.ts`, `views/settings/SettingsEasterEggs.tsx`, `lib/settingsSearch.ts`, `components/hermes/HermesShell.tsx`, `extensions/legacyBuiltins.ts` (Bootstrap-Aufruf).
- Neu: `views/settings/HermesV2Settings.tsx`, `extensions/hermesV2Builtins.ts`, `views/HermesV2Route.tsx`, `components/hermes/v2/HermesV2Shell.tsx` und featurelokale CSS-Datei.
- Preference-Tests und Route-/Shell-Tests ergänzen. Bei Flag aus darf kein V2-Socket entstehen.

Die konsolidierte API-Matrix und verbindliche Transportarchitektur folgen nach dem Protokoll- und UX-Research in `hermes-v2-inventory.md`.
