# Phase 10: gezielte Korrekturen C1 und C2

17.10.2026. Root-Autorenantwort auf den unterbrochenen unabhängigen C-Check.
Kein unabhängiges Reviewurteil. Originale Zwischenbefunde und Grenzen stehen in
`hermes-v2-phase10-c-interrupted.md`; alle alten Artefakte bleiben unverändert.

## Änderungen

C1: `hermes-v2-sidebar.css` gibt den Sidebaraktionen44px Mindesthöhe und dem
Sitzungsmenü44px Mindestbreite. `hermes-v2-composer.css` gibt Denktiefe und
Dateiauswahl44px Mindesthöhe, auch oberhalb der globalen mobilen Breakpoints.
Keine neuen Farben, Komponenten, Abstraktionen oder Runtimeänderungen.

C2: Der Schließenknopf des bestehenden `ContentDialog` verwendet das bereits
etablierte `data-modal-autofocus` statt Reacts unmittelbarem `autoFocus`.
`useModalFocus` sichert so zuerst das bisherige Eingabefeld und fokussiert danach
den bevorzugten Schließenknopf. Die bestehende Fokusfalle, Escape-/Historylogik
und Rückgabe an den ursprünglichen Fokus bleiben zuständig. Keine Hermes-
Sonderlogik und keine Änderung am Hook oder an öffentlichen Schnittstellen.

Diese gemeinsame Änderung betrifft alle ContentDialog-Aufrufer. Der bevorzugte
Schließenknopf bleibt gleich; die fehlerhafte Reihenfolge beim Öffnen entfällt.

## Gesunde Vorher-/Nachherkontrollen

Neue additive `tests/e2e/hermes-v2-focus-targets.spec.ts`, unverändert zwischen
beiden Läufen. Desktopziele werden nach Clipping durch sämtliche Eltern und
echtem Centerhit vermessen. Hilfe wird über den echten Slashcommand geöffnet;
Escape und Schließen werden bei1440/390px getrennt geprüft. Danach bleiben
Fokus, normaler Entwurf und Shift+Enter erhalten, ohne Textsubmit.

Vor Fix: sechs Fälle, einer grün und fünf rot, tatsächlicher Exit1. Desktop1440
verfehlt44px. Vier Hilfefälle verfehlen bereits den deklarierten bevorzugten
Schließenfokus; der unabhängige Reviewer hatte zusätzlich verlorenen BODY-
Fokus nach Escape zweimal belegt. Die ursprünglichen gesunden Repros bleiben
für den neuen unabhängigen Nachcheck erhalten.

Nach Fix: dieselben sechs Fälle grün. Zusammen mit den vier unveränderten
Ausgabe-/Copyfällen und beiden initialen Shortstopfällen12/12, Exit0.

```sh
WRAPT_E2E_URL=http://127.0.0.1:19470 WRAPT_E2E_ISOLATED=true \
  WRAPT_E2E_EXTERNAL=true pnpm exec playwright test \
  tests/e2e/hermes-v2-focus-targets.spec.ts \
  tests/e2e/hermes-v2-output-layout.spec.ts \
  tests/e2e/hermes-v2-short-stop.spec.ts --project=chromium --workers=1
```

Logs: `/tmp/wrapt-hermes-v2-phase10-c-fixes-initial.log` und `-final.log`.
Browserartefakte unter `temp/hermes-v2/generated/phase10-c-fixes-*`.
Nur eigener isolierter Testserver, keine realen Hermesaktionen.

13 gezielte ModalDialog-/Composer-Komponententests Exit0. Vollständiger
`pnpm typecheck`, Bereichs-ESLint mit max-warnings0 und isolierter kompletter
Webbuild einschließlich Kompression jeweils Exit0. Beide CSSdateien342/389
Zeilen; keine Baseline verändert. Versionsstand bleibt das noch unveröffentlichte
2.9.0-Feature, Changelog um die sichtbare Korrektur ergänzt.

## Stand der Gesamtprüfungen

Vor C1/C2 waren191/191 Hermesbrowserfälle grün, tatsächlicher Exit0. Der erste
parallel ausgeführte Standardtestlauf hatte zwei5s-Timeouts in unveränderten
Notificationdatenbanktests. Dieselbe Datei separat12/12 grün. Der nachfolgende
Standardlauf mit Paketparallelität1 und zwei Vitestworkern liefert vollständige
grüne Abschlusslogs: Server1793, Web2178, Contracts160, Extensioncontracts454,
Launcher2, Docs3. Sein exec-Handle ging beim Sitzungswechsel verloren; dessen
OS-Exitcode wird deshalb nicht nachträglich erfunden.

Ein abschließender Standardlauf gegen den finalen Stand wird vor Gesamtabschluss
erneut mit gesichertem Exitstatus ausgeführt. Keine Tests oder Zeitlimits dafür
abgeschwächt. Die unabhängige C-Nachprüfung und Phase11 bleiben eigene Gates.

## Freeze und Betrieb

528 Quellen einschließlich gemeinsamem ModalDialog/Focus-Hook im neuen Manifest
`temp/hermes-v2/generated/phase11-after-c-fixes-code-freeze.json`, SHA256
`6a785985d37598c6a940a82410d0cf93ba4cf5ae64691c2d865569499a68354c`.
Die früheren523er-/525er-Manifeste bleiben unverändert.

Beim Sitzungswechsel waren die bisherigen eigenen Testprozesse bereits beendet.
Neuer eigener Source-Testserver auf vorher freiem19470, PID3561491; Hermes bleibt
ausgeschaltet. Nutzerdienste, Previews, Slots und Accounts wurden nicht verändert.
Den MCP-Browser besitzt ausschließlich die neue unabhängige C-Instanz. Cleanup
und deren tatsächliche Messungen werden in ihrem eigenen Bericht dokumentiert.

## C3 nach terminalem unabhängigen C-Review

Das unabhängige C-Gate schließt C1/C2 und bestätigt den528er-Freeze sowie Cleanup.
Offen blieb ein Low zur gleichen44px-Größenregel: Shelf-Schalter, Abgleichbanner,
Projektselect und beide Neu-Dialogaktionen sowie zwei Verwaltungslinks.
Kein neuer High oder Blocker. Bei4000Rows plus zusätzlichem Fehlerbanner bleibt
Stop per echtem Bodywheel und Tastatur erreichbar; der bisherige Initialtrigger
ohne Zusatzbanner bleibt44px sichtbar. Diese Scrollgrenze ist in der Doku benannt.

Root korrigiert C3 ausschließlich in drei CSSquellen: Sidebar-Shelfschalter
mindestens44px breit; Verbindungs-/Fehler-/Unknown-Bannerbuttons, Projektselect
und Neu-Dialogaktionen mindestens44px hoch; Ressourcenstatuslinks mit eigener
44px hoher Inline-Flexfläche. Normale Markdownlinks bleiben unberührt.
Keine Texte, API-/Runtime-/Storelogik, Farben oder Tokens geändert.

Erneuter isolierter vollständiger Webbuild einschließlich Typen/Kompression
und Architekturprüfung jeweils Exit0. Die drei CSSquellen343/373/362Zeilen.
Die unmittelbar vorherige vollständige Suite4590Tests und197Browserfälle hatte
jeweils Exit0; C3 erhält zusätzlich gezielte Browserregressionen und den frischen
unabhängigen Phase11-Visualcheck, keine automatische unabhängige Schließung.

Neuer528er-Freeze `temp/hermes-v2/generated/phase11-final-code-freeze.json`, SHA256
`ccb74567febc5c93bc75e23c5fd2bad7f07d8e67f6ad213414b630d77babb140`.
Alle vorherigen Manifeste, Repros und Berichte bleiben unverändert erhalten.
