# Phase9: Sitzungskontext, M3-Korrektur

17.10.2026. Autorenumsetzung ausschließlich des von Root freigegebenen M3 aus
`plans/hermes-v2-phase9-codex-ux-gate-r2.md`. Produktquellen nach abgeschlossenen
Typ-/Lintprüfungen eingefroren. Unabhängiger Gegencheck und Browsernachweis
stehen aus; keine eigene UX- oder Phase9-Gesamtfreigabe.

## Verhalten

Die Chatfläche zeigt jetzt den tatsächlich gemeldeten Sitzungskontext unabhängig
vom Sitzungsdrawer. Eine einzige begrenzte Metadatenzeile enthält die drei Felder
Arbeitsverzeichnis, Projekt und Quelle. Projekt ist die rohe projectId, Source
bleibt roh; aus einem Pfad werden weder Projektzugehörigkeit noch Namen geraten.
Fehlende, leere oder noch nicht gemeldete Angaben heißen „Nicht gemeldet“.

Die neue Komponente liest ausschließlich die übergebene aktuelle Snapshotprop.
Ihre Sessiondaten müssen zu snapshot.sessionId gehören. Bei IDwechsel,
fehlender neuer Sessionprojektion und leerer Auswahl bleibt kein vorheriger Wert
stehen. Änderungen derselben Session aktualisieren die reine Darstellung direkt.
Keine Hooks, lokale Kopie, Persistenz, Abfragen oder Runtimeänderung.

Das Raster behält drei begrenzte Spalten und genau eine 44px hohe Zeile.
Lange Originalwerte bleiben vollständig im DOM, ohne neue gekürzte Stringkopie.
Jedes Feld ist nativ scrollbar, per Tastatur fokussierbar und enthält auswählbaren
Text. Auch Leerzeichen und Zeilenumbrüche bleiben erhalten. Ein nativer title
ergänzt die Scroll-/Textzugänglichkeit, ersetzt sie aber nicht. Keine neue Hilfe,
Modalfläche oder Verdeckungslogik.

Die Zeile liegt nach dem Requestdeck und vor dem Verlauf. minmax(0,...) und
eigene Scrollfelder begrenzen den Platzbedarf langer Pfade; Verlauf behält seine
bisherige Flex-/Scrollzuständigkeit. Requests, Work und Composerlogik wurden nicht
verändert. Tatsächliche 390×500-Belegung und sichtbare Stop-/Freigabeziele prüft
Root im frischen Browserbundle.

Design-system-guide und mobile-design gelesen und angewandt: bestehende
Wrapt-Farb-, Abstands-, Schrift- und Fokustokens, 16px Mindestgröße der Werte,
44px-Felder, keine neuen Farben oder Kartenstapel.

## Exakter Scope

- HermesV2ChatSurface.tsx: ein Import und die reine Kontextanzeige.
- Neue HermesV2SessionContext.tsx: beschriftete Region „Sitzungskontext“ mit dl.
- hermes-v2-chat.css: ausschließlich lokale Kontextregeln.
- Neue HermesV2SessionContext.test.tsx: elf additive Fälle.

Alle Dateien unter `apps/web/src/components/hermes/v2/`.
Zeilenzahlen: 237/32/364/115 in obiger Reihenfolge. Root akzeptierte die
Verantwortungsprüfung der reinen Chatlayoutdatei ab 350 Zeilen ausdrücklich.
Keine weitere Aufteilung oder breite Formatierung.

## Prüfungen

- Elf neue Fälle prüfen bekannte Werte, rohe Projektkennung/Quelle, vollständige
  lange Werte, Fokuszugang, echte Leerzeichen/Zeilenumbrüche, fehlende Angaben,
  fehlende Projektzuordnung trotz CWD, Sessionwechsel, ausstehende Projektion,
  falsche SessionID, Leerwahl und aktualisierte Daten derselben Session.
  Integration in Route/Standalone/Panel/Orbit ohne zusätzlichen Read/Create/Send.
- 71/71 in sieben relevanten Dateien grün: neue Kontextfälle, bestehende
  ChatSurface-, ReadObserver-, ComposerArea-, WorkPanel-, SelectionTiming- und
  V2Shellfälle. Frühere unmittelbare Auswahlregressionen bleiben gesund.
- 28/28 in drei weiteren unveränderten Begleitdateien grün, darunter Anhänge
  und bestehende Modell-/Arbeitsaktionsprüfungen. Kein kompletter Weblauf behauptet.
- Vollständiges `pnpm typecheck` im finalen Stand grün: Extension-Contracts,
  Contracts, Server, Web und E2E-Typen. Eigene neue Dateien ohne Typkorrektur grün.
- Scoped ESLint aller drei TSXdateien mit `--max-warnings=0` grün.
  CSS mit bestehendem PostCSS erfolgreich geparst; nur vorhandene Farbtokens.
- `pnpm architecture:file-lines` grün; keine Baseline geändert.

Roots fünf gesunde Browser-Sollfälle waren gegen das unveränderte alte Bundle
rot, nachdem jeweils die Composerbereitschaft bestätigt war. Das sind Roots
Fremdbelege, kein eigener Browserlauf. Die unveränderten Nachherfälle sowie
390×500 mit Requests/Stop und tatsächliche lange Scrollwerte bleiben bei Root.
jsdom liefert keinen visuellen Layout-/Überlaufnachweis.

## Freeze und Abschluss

Finaler Vierdateifreeze mit vollständigen Einzelhashes:
`temp/hermes-v2/phase9-context-fixes/context-code-freeze.json`.
SHA256: `4b6ee2be239b52e6188d6f11adbb7ccd689f5f46e5835714c659446889d9299c`.
Der Manifest-SHA256 steht zusätzlich in `freeze-integrity.json` im selben Ordner.
Gegen den alten unveränderten 513er-Rootfreeze unterscheiden sich genau die zwei
freigegebenen bestehenden Dateien ChatSurface und Chat-CSS; die anderen 511
Quellen bleiben identisch. Hinzu kommen ausschließlich neue Komponente und Test.

Bestehende Tests, Fakes, Assertions, Reviewartefakte und alte Manifeste wurden
nicht verändert. Keine Änderung an bisherigen M1/M2/L1-Fixes, Runtime, API,
Contracts, Requests oder Composerlogik. Root besitzt Dokumentation/Orchestrierung,
neue E2Es, integrierten Freeze und frischen Build.

Keine weiteren Agents, MCP-/Browser-, Server-, Preview-, Core-/CLI-, Git-,
Versions- oder Neustartaktionen. Reactflächen aus den Komponententests bereinigt.
Nach diesem finalen Stand keine weiteren Quellen-/Teständerungen; Stopp bis
zum unabhängigen Gegencheck.
