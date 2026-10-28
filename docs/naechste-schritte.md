# Aktueller Wartungsstand

Stand: 22.10.2026. Die [Aufgabenliste vom August](archive/naechste-schritte-2026-08-28.md)
ist ein historischer Stand und keine aktuelle Fehlerliste.

## Bereits abgesichert

- Der Routen-Cache hält bis zu zehn Routen. `PersistentOutlet.test.tsx` prüft den Erhalt
  eingebetteter Flächen sowie Verdrängung und Cleanup der ältesten inaktiven Route.
- Der T3-Kanal hat Service-Tests unter `apps/server/src/services/t3ChannelService.test.ts`.
  Sie ersetzen keinen echten Downgrade-Test einer privaten T3-Datenbank.
- E2E verwendet standardmäßig einen isolierten Server auf Port 19310. Eine eigene Adresse
  verlangt zusätzlich die ausdrückliche Isolationsmarkierung. Reset-Helfer verwenden diese
  gemeinsame Adresse und fallen nicht auf die laufende Workbench zurück.
- Die aktuellen Einstellungen und ihre Bedienwege stehen in [settings.md](settings.md).
  Der Hermes-Dispatcher verwendet Classic als Standard und V2 als optionale Oberfläche.
- Gemeinsame Verträge sind nach Fachgebiet aufgeteilt; `packages/contracts/src/index.ts`
  exportiert die bisherigen Namen weiterhin. Dashboard-Styles liegen in eigenen Modulen. Eingefrorene Dateigrößen sinken nach tatsächlicher Aufteilung.

## Noch im Betrieb zu prüfen

Ein echter Wechsel von Nightly zurück auf Stable benötigt ein Backup und eine eigene
Freigabe für den Dienstneustart. Er wird nicht an der laufenden privaten Datenbank getestet.
Classic bleibt für Hermes-Verwaltungsfunktionen nötig. Es wird erst entfernt, wenn V2
alle benötigten Abläufe übernimmt und diese mit einem aktuellen Gateway geprüft sind.

Messwerte für Kaltstart und Serverantworten stehen in
[performance-verification.md](performance-verification.md). Frühere Zahlen sind mit ihrem
Messstand gekennzeichnet und gelten nicht automatisch für neue Builds.
