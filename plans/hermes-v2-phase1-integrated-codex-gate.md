# Hermes V2: unabhängiges integriertes Phase-1-Codex-Gate

Stand: 16.10.2026. Prüfung im shared Checkout gegen den aktuellen Webcode,
das verbindliche `hermes-v2-inventory.md` und Phase 1 des Originalauftrags.
Die geprüften Shell-/Drawer-Dateien haben den Änderungsstand 15:48 UTC.

## Urteil: PASS für Phase 1

Keine offenen Blocker-, High- oder Medium-Findings im beauftragten Scope.
Default-off, Preference-Migration und Tab-Abgleich, Classic-Erhalt,
Feature-Registrierung und native leere Shell erfüllen den Phase-1-Vertrag.
Die früheren Befunde Parent-M1 sowie DeepSeek-H1/M1 sind im aktuellen
integrierten Code geschlossen. Dies ist keine Freigabe der späteren Phasen.

## Selbst geprüfte Produktgrenzen

- `stores/appPreferences.ts`: stabiler Schlüssel `wrapt.app-preferences.v1`,
  Zustand-Version 2, explizite Migration mit Erhalt von `defaultPage`.
  Nur exakt `true` aktiviert V2; fehlende, ungültige und beschädigte Werte
  fallen auf false zurück. Storage-Events lesen den aktuellen Speicher ohne
  Schreibecho, einschließlich alter Version und Speicherlöschung. `App.tsx`
  bindet den Listener per Effect mit Cleanup ein, nicht beim Store-Import.
- `HermesShell.tsx:13`: das Flag entscheidet in Route, Panel und Orbit.
  `?ui=classic`, vorhandenes `?path` und gespeicherte Panel-Verwaltungsziele
  behalten Classic-Vorrang. Die letzte aktive Classic-Auswahl bleibt beim
  Parking erhalten; fremde Query-Parameter wechseln keine geparkte UI aus.
  Globales Abschalten wirkt auch auf eine geparkte V2-Fläche.
- `HermesClassicShell.tsx`: automatischer Vergleich mit der bisherigen
  HEAD-Fassung von `HermesShell.tsx` ergibt identischen Inhalt bis auf
  Funktionsname und Dokumentationskommentar. iframe-, Session-, Panelpfad-
  und Aktivitätslogik wurden vollständig übernommen.
- `hermesV2Builtins.ts`: eigener Owner, eigene lazy Page-Exports, Pfade ohne
  Router-Basename. Normalroute hat `full-bleed`, persistent, Topbar und mobile
  Navigation; Standalone liegt außerhalb der AppShell und ist nicht persistent.
  Beide deaktivieren Projektkontext und Breadcrumbs. Keine neue Hauptnavigation
  und keine Änderung der eingefrorenen Legacy-Routen.
- `HermesV2Shell.tsx:27`: Flag-off endet vor Surface-/Drawer-/Viewport-Hooks
  in der Aktivierungskarte. Der alte Einstieg lädt V2 ausschließlich lazy im
  On-Zweig. Die Phase-1-Shell enthält weder Transportinstanz noch Chat-Hook,
  API-Abruf, Polling oder WebSocket. Diese Aussage betrifft V2-Zusatztraffic,
  nicht die vorhandenen globalen Workbench-Abfragen.
- Die aktive Shell ist nativ, ohne iframe und ohne erfundene Sessiondaten.
  Classic- und Fensterlinks erhalten URL-kodierte Query-Session-IDs.
  Standalone verwendet dieselbe Surface, `useResponsiveShell`, Visual-Viewport-
  Variablen und Safe-Area-Regeln. Der redundante Ganzseitenlink ist entfernt.
  CSS nutzt Wrapt-Tokens und berücksichtigt reduzierte Bewegung.

## Nachprüfung der gemeldeten Korrekturen

DeepSeek-H1: `HermesV2Shell.tsx:109` erlaubt für `panelAdminPath` ausdrücklich
`string | undefined`; die Übergabe an Zeile 36 ist mit EOPT vereinbar.
Der eigene vollständige Typecheck bestätigt die Korrektur.

DeepSeek-M1: `useHermesV2Drawer.ts:11` beobachtet die Containerbreite und räumt
ResizeObserver/Listener auf. Bei inaktiver Route oder breitem Layout schließt
der Drawer; nur aktiv, kompakt und geöffnet wird er modal. Die Shell setzt
geschlossen `inert` auf den Layer und `aria-hidden` auf die Sidebar; geöffnet
erhält sie Dialogrolle und `aria-modal`. Der sichtbare Schließen-Button ist
Autofokusziel. Der tatsächlich gelesene bestehende `useModalFocus` übernimmt
Fokusfang, Escape, Hintergrund-Inertsetzung samt Wiederherstellung und
Fokusrückgabe. Der Backdrop ist aus dem Accessibility-Tree entfernt und kein
zusätzliches fokussierbares Steuerelement. Der aktuelle Komponententest prüft
geschlossenen Inert-Zustand, Fokus auf Schließen, Tab-Fang, Escape,
Fokusrückgabe zum Toggle sowie Schließen per Backdrop erfolgreich.

Parent-M1: aktuelle Dispatcher-Tests mit echtem `PersistentOutlet` bestätigen
dieselbe klassische iframe-Instanz nach Parking und Rückkehr. Die inverse
V2-Variante übersteht fremde `path`-Parameter und fällt bei Flag-off sofort
auf Classic zurück. Die separate Integration nutzt den echten lazy Dispatcher
und die echte V2-Shell; der Dispatcher-Stub wird dort nicht verwendet.

## Eigene ausführbare Prüfungen

- 58 Tests in 10 Dateien bestanden: `appPreferences`, `settingsSearch`,
  `hermesV2Routes`, `hermesV2Builtins`, `HermesShell`, `HermesV2Integration`,
  `HermesV2Shell`, `HermesV2Route`, `HermesV2Settings`, `HermesAdminFrame`.
  Darin enthalten sind die zwei Tests mit echtem Dispatcher und echter Shell.
- Zusätzlich 28 Tests in 4 Dateien bestanden: `routeHost`, `pageRouteRegistry`,
  `routeModules`, `SettingsEasterEggs`.
- `pnpm typecheck`: vollständig bestanden, einschließlich Extension-Contracts,
  Contracts, Server, Web und E2E-Typprüfung. Keine Phase-2-Implementierung aus
  diesem Ergebnis fachlich freigegeben.
- Gezieltes ESLint über sämtliche Phase-1-Webänderungen, neue Tests und
  `tests/e2e/hermes-v2.spec.ts` mit `--max-warnings=0`: bestanden.
- `pnpm architecture:file-lines`: bestanden, 1678 Dateien geprüft.
  `scripts/architecture/file-line-baseline.json` ist gegenüber HEAD unverändert.

## Vorhandene Nachweise und Grenze der Browseraussage

Die angeforderten Logs `accessibility-tests-r2` und `integrated-typecheck-r4`
unter `/tmp/wrapt-hermes-v2-phase1-*` wurden gelesen. Sie sind durch die obigen
eigenen aktuellen Tests und den vollständigen Typecheck ergänzt.

`/tmp/wrapt-hermes-v2-phase1-e2e-r2.log` meldet 9 bestandene Chromium-E2E-Tests,
einschließlich Classic-Regressions, Toggle/Reload, Tab-Sync, Sessionlinks und
vier Abnahmebreiten. Das Log endet um 15:44 UTC und liegt vor dem letzten
Drawer-Fix um 15:48 UTC. Es ist deshalb kein Browsernachweis dieses letzten
Fixes. Die Accessibility-Korrektur wurde hier durch Code und aktuelle jsdom-
Tests geprüft. Keine neue Browser-/Screenshot-Abnahme behauptet; der finale
Browser-Recheck bleibt beim Parent. Gemäß Reviewauftrag keine Services,
Previews oder Benutzerzustände verändert und keinen E2E-Server gestartet.

## Optionaler Blick auf den Organisations-Handoff

Die Antworten auf Organisationsreview H1 und M1 bis M3 sind im aktualisierten
Handoff vorhanden: beobachteter Attention-Cursor statt Read-Empfangszeit,
dauerhafte Snooze-Entwertung unabhängig von Read, Pin-Listenrevision plus
vollständige Mitgliedschaft und getrennte gemeinsame Attention-Fakten mit
Principal-übergreifender Invalidierung. Die passenden Rennfalltests sind
aufgeführt. Phase 4 bleibt ausdrücklich offen; kein Organisationsgate erteilt.

## Umfang dieses Reviews

Keine Beanstandung des planmäßig fehlenden Chats. Phase-2-Backend im
unregistrierten Arbeitsstand weder reviewed noch verändert. Kein Gesamtaudit,
keine Produktänderung, Subagents, Commits, Neustarts oder Baseline-Erhöhung.
Einziges bewusst geschriebenes Repo-Artefakt dieses Reviews ist dieser Bericht.
