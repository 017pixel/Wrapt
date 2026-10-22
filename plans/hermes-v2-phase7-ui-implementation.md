# Phase 7: UI-Implementierungsbericht (GLM, Freeze)

Stand 17.10.2026. Scope: native Aufgabenansicht, Sendaktionen, Styles, Fixtures,
gezielte Integration. Kein eigener Browserlauf. Root führt Tests, E2E und
Integration. Die zwei UItest-Dateien sind nach Übergabe exklusiv Root, dort
25/25 grün. Nichtvisuelle Client-Punkte bleiben beim Clientautor.

## Stand der Arbeit

Chatfläche mit einklappbarer Aufgabenansicht: Kopfzeile Auf/Zu und Aktualisieren,
Region mit Status, Teilabdeckung, Queuekopf, Unteraufgabenbaum, Prozessen,
Fehlerdelegationen, Nebenaufgaben und begrenztem Aktionslog. Sendenzeile mit
Steuern, Einreihen, Hintergrund und Zwischenauftrag. /queue und /steer füllen
das Sendefeld und verweisen auf die Aktion, nichts sendet roh. Queue, Steer,
Btw und Background laufen laut Root-Browserlauf grün.

## Resultate

Eine resolvierte submit-Promise ist kein Erfolgsnachweis. Aktionen zeigen
pending, unknown, not_sent und confirmed mit konkretem Resultat: found=false,
available=false, already_exited, not_found, error, rejected, queued, redirected
und Queuestatus. Unbekanntes wird nicht automatisch wiederholt. Ziele kommen nur
aus dem eigenen Roster. Fehlerdelegationen haben keine Kindaktionen. Counts
bleiben null bis zum vollständigen Read. Verschwinden behauptet keinen Erfolg.
Neuer Tailread ohne available entfernt die alte Ausgabekarte. Pending oder
unknown zeigen keine alte Ausgabe als aktuelle Ausgabe.

## Bindung und Identität

Offene Zeilendetails, Ausgaben und Notizen hängen an sessionId,
activeSnapshot.generation und sichtbarer aktiver Fläche. Wechsel leert sie.
A-B-A und Hidden übernehmen nichts Altes. Die Offen-Präferenz der Region bleibt
parkiert. Body-IDs kommen aus dem Panel-useId. Route, Panel und Orbit kollidieren
nicht. Verschiedene Domänen bleiben getrennte Zeilen. Gleiche Anzeigeziele
bekommen die Kennung ins Label.

## Queuekopf

Der Verlauf zeigt den eingereihten Kopf immer, mit role=status und Label
„Nächste eingereihte Nachricht“. Die Aufgabenansicht wiederholt ihn nur, wenn
im Verlauf kein Kopf steht, sonst meldet sie belegt oder unbekannt. Der
Testfehler mit dem unsichtbaren Kopf bei zugeklapptem Panel ist durch
Zurücknahme der Verlagerung gelöst. Zweites Einreihen sperrt nicht.
queuedShown=true unterdrückt den Panelkopf. Kopfquellen sind Snapshot und
work.read.

## Höhenlayout nach Root-Messung

Request-Deck ist eine begrenzte Scrollfläche für Karten und Classic-Footer,
mindestens 56 hoch, Deckliste ohne eigenen Überlauf, Footer im gemeinsamen
Scrollbereich, nichts ragt heraus. Aufgabenansicht ist eine Flex-Spalte:
Kopfzeile flex none mit 44 Höhe, Region flex 0 1 auto mit eigener Scrollfläche
und Klemmwerten über der Viewporthöhe, mobil ohne Countzeile. Eine geöffnete
Region reserviert 98 Mindesthöhe, damit flex die Fläche nicht auf 0 schrumpft.
Bei knapper Höhe begrenzt der Chiplistenklemmwert mit gleicher Spezifität die
Liste auf 44, Modellunterzeile läuft nowrap plus Ellipse. Sendenzeile ist eine
44er-Reihe mit eigener horizontaler Scrollfläche. Aktionen und Labels bleiben
erhalten, 44 mal 44 auch im Desktopmodus. Composer, Stop und Anhängechips
verschieben sich nicht; die sichtbare Region prüft Root im neuen Lauf.

## Design

Nur Wrapt-Tokens, keine neuen Hexwerte, Gradients oder Emojis. Status nie nur
durch Farbe. Touch 44, Eingabetext 16, Reduced Motion beachtet. Keine neue
Shell, Sidebar, Runtime oder Queue. Die bestehende Fläche wurde erweitert.

## Dateien

Neu, nur von mir geändert: HermesV2WorkPanel.tsx, work-panel-rows.tsx,
work-format.ts, HermesV2WorkSendActions.tsx, hermes-v2-work.css,
work-panel-fixtures.tsx, UItest-Entwürfe (seit Übergabe bei Root).
Integration: HermesV2ChatSurface.tsx (Panel, Queueabgleich, Entfernung des
Queue-Blockings), HermesV2ComposerArea.tsx (Sendenzeile, /queue- und
/steer-Intents), HermesV2MessageList.tsx (role=status, queuedInView-Prop),
hermes-v2-requests.css (Deck als eine Scrollfläche). Keine chat-*, gateway-*,
Server-, Contract- oder Root-Fixturedateien geändert.

## Prüfung

Web-Typen grün. Scope-ESLint über meine Produktdateien grün.
architecture:file-lines OK, alle meine Dateien unter 400 Zeilen. Root:
UItests 25/25, Browserläufe 17/18 und 27/31 mit den beschriebenen
Layoutpunkten. Die Höhenkorrekturen dieser Fortsetzung prüft Root neu.
Physische Klickpunkte bestätige ich nicht vorab.

## Grenzen

Vier nichtvisuelle Client-Restfindings bleiben beim Clientautor. Der
Queuekopf folgt nur Snapshot und work.read. Kein eigener Browser-PASS, kein
Gesamtfreigabeverdikt. Phasen 8 bis 11 unverändert, die Phase-6-UX-Lows
L1 bis L4 blieben unangetastet.

Schlusspunkte. Wichtigste Nutzerwirkung: native Aufgabenansicht und
Queueaktionen mit ehrlichen Namen und Resultaten in Wrapt-Optik. Zentrale
Umsetzung: belegte Sicht, exakte Ziele, eigener Scrollbereich und Flex-Grenzen
in der bestehenden Chatfläche. Prüfung: Root führt den Browserloop und die
Klickprüfungen. Grenze: alleiniger Browserpass bleibt Root vorbehalten.

**Freeze: Phase-7-UI-Umfang ist nach der Höhenkorrektur abgeschlossen. Keine
weiteren Produktedits ohne Root-Fixauftrag.**
