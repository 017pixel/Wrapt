# Hermes V2: unabhängiges Review der Phase-1-Grenze

Stand: 16.10.2026. Geprüft wurde der Parent-Stand vor der angekündigten
Korrektur des Dispatchers. Read-only-Review, ausschließlich dieser Bericht
wurde angelegt. Keine Produktänderungen, Dienste, Previews, Neustarts,
Commits, Browserprüfung oder Claude-CLI.

## Urteil: needs fixes

Keine Blocker oder High-Findings. Ein nachgewiesenes Medium-Finding bleibt
für diesen geprüften Stand offen. Der Parent hat die Korrektur übernommen;
deren Umsetzung und Regressionstests sind separat erneut zu prüfen.
Deshalb noch keine uneingeschränkte Freigabe dieses Teils.

## Geprüfter Umfang

- `apps/web/src/stores/appPreferences.ts` und zugehörige Tests.
- Storage-Effect in `apps/web/src/App.tsx`.
- `HermesShell.tsx`, `HermesClassicShell.tsx`, `HermesShell.test.tsx`.
- Einbindung in `extensions/builtinContributions.ts`.
- `tests/e2e/hermes-v2.spec.ts`, ausschließlich gelesen.
- Verbindlicher Vertrag aus `hermes-v2-inventory.md` und
  `hermes-v2-inventory-gate-r2.md`, relevante Phase-1-Auftragsregeln.

V2-Shell, Einstellungen und Feature-Routen werden parallel durch GLM erstellt.
Ihr zeitweiliges Fehlen ist ein bekannter Zwischenstand und kein Finding.
Diese Implementierungen wurden hier nicht zusätzlich geprüft.

## Medium

### M1: Parken verwirft die explizit gewählte klassische Oberfläche

**Ort:** `apps/web/src/components/hermes/HermesShell.tsx`, Zeilen 13 bis 17
des geprüften Stands. `params` bestimmt die UI-Auswahl unabhängig von
`props.active` und `useRouteActivity()`.

**Auslöser:** V2 aktivieren, `/hermes-agent?ui=classic&session=first` öffnen,
danach innerhalb der normalen Wrapt-Shell zu `/settings` wechseln. Der
`PersistentOutlet` hält die Hermes-Route korrekt im Baum und markiert sie
inaktiv. Ihr Dispatcher sieht jedoch die Query der neuen aktiven Seite.
Ohne `ui=classic` oder `path` wechselt die versteckte Hermes-Route zu V2.
Das klassische iframe wird entfernt und bei der Rückkehr neu erstellt.

**Auswirkung:** Classic verliert den bisher erhaltenen SPA-Zustand und lädt
erneut. Insbesondere eine innerhalb der SPA geöffnete Session oder Adminseite,
die nicht mehr dem ursprünglichen Host-Deep-Link entspricht, wird verworfen.
Außerdem lädt V2 verdeckt, obwohl zuletzt ausdrücklich Classic gewählt wurde.
Die inverse Richtung betrifft geparkte V2-Flächen, wenn die aktive URL
anschließend eine Classic-Query enthält. Das globale Abschalten des Flags
muss trotzdem jede V2-Fläche unmittelbar entfernen.

**Evidenz:** Zusätzlicher ausschließlich im Speicher ausgeführter jsdom-Test
mit tatsächlichem `MemoryRouter`, `PersistentOutlet`, `HermesShell` und
`HermesClassicShell`. Nur die zu diesem Zeitpunkt noch fehlende V2-Shell wurde
durch einen in-memory Stub ersetzt. Ergebnis:

```text
initial classic frame: /hermes/chat?resume=first connected: true
actual PersistentOutlet at /settings:
  classic frames: 0, original connected: false, hidden V2: 1
after return: same classic frame: false
```

**Korrektur:** Die zuletzt aktive URL-Auswahl pro Hermes-Fläche erhalten und
bei geparkter Route beziehungsweise inaktivem Panel nicht aus einer fremden
aktiven URL neu ableiten. Dabei `props.active ?? useRouteActivity()` beachten.
Das globale Feature-Flag bleibt unabhängig davon sofort wirksam.

**Regressionstests:** Echte Router-Navigation Classic → andere Seite → Classic,
mit Prüfung derselben iframe-Identität und des erhaltenen Pfads. Ebenso
V2 → andere Seite mit Classic-/`path`-Query, ohne versteckten UI-Wechsel.
Flag-Abschaltung bei geparkter V2-Fläche weiterhin prüfen. Die vorhandenen
Shell-Tests prüfen nur getrennte Initial-Mounts und den Flagwechsel.

## Bestätigte Grenzen

- Der bestehende Storage-Key bleibt `wrapt.app-preferences.v1`, das
  Zustand-Schema steigt auf Version 2. Die explizite Migration erhält eine
  gültige Startseite; allein exakt `true` aktiviert V2.
- Fehlende oder ungültige Flagwerte und syntaktisch beschädigte JSON-Daten
  ergeben false. Die Merge-Funktion ersetzt keine Store-Aktionen.
- Storage-Abgleich liest den aktuellen lokalen Speicher. Der synchrone
  Zustand-5.0.15-Hydrationspfad und die Schreibsperre vermeiden auch bei
  Version-1-Migration ein Echo. Fremde Storage-Areas/Keys werden ignoriert.
- Beim Store-Import entsteht kein globaler Listener. Der App-Effect registriert
  den Listener und gibt dessen Cleanup zurück.
- Die klassische Shell übernimmt die bisherige V1-Pfad-, Session-, Activity-
  und Panel-Persistenzlogik unverändert. Bei deaktiviertem Flag gibt der
  Dispatcher unmittelbar Classic zurück.
- `?ui=classic`, vorhandene `?path`-Links und gespeicherte Adminziele eines
  Panels bleiben klassisch. Session-IDs werden weiterhin URL-kodiert.
- Der V2-Import im Dispatcher ist lazy und wird im Off-Zweig nicht aufgerufen.
  Die vollständige Off-Grenze der neuen Routen bleibt Teil der Integration.

## Ausgeführte Prüfungen und Evidenzgrenze

- Preference-Tests und beide bestehenden AdminFrame-Tests: 3 Dateien,
  17 Tests erfolgreich.
- Zusätzliche jsdom-Reproduktion mit tatsächlichem PersistentOutlet:
  M1 reproduziert, kein Testserver und keine Datei dafür angelegt.
- `pnpm architecture:file-lines`: erfolgreich, 1629 Dateien geprüft.
- `pnpm typecheck`: Extension-Contracts, Contracts und Server erfolgreich;
  Web meldet die noch fehlenden GLM-Module `HermesV2Shell` und
  `hermesV2Builtins` sowie den daraus folgenden JSX-Typfehler. Dies ist der
  bekannte Zwischenstand, kein weiteres Finding. E2E-Typprüfung wurde wegen
  des vorherigen Web-Fehlers nicht erreicht.
- Die neuen Shell- und E2E-Tests wurden wegen der fehlenden Module noch nicht
  als vollständiger integrierter Lauf ausgeführt. E2E-Prüfung, Browserprüfung,
  vollständiger Typecheck und das Review der M1-Korrektur bleiben beim Parent.

Es wurden keine weiteren Blocker-, High- oder Medium-Probleme innerhalb des
beauftragten Parent-Scopes nachgewiesen.
