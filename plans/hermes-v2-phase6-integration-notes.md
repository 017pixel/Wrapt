# Phase 6: Root-Integration

Stand: 16.10.2026, 22:41 UTC. Backend-R3 und Client-R2 unabhängig PASS.
Die implementierte Oberfläche ist eingefroren. Das unabhängige UX-Gate ist PASS mit vier nicht blockierenden Low-Beobachtungen.
Phase 7 wurde danach freigegeben; die Gesamtfreigabe bleibt offen.

## Korrigierte Integrationsbefunde

- Initialer Katalogread fehlte. Die aktive sichtbare Sitzung lädt jetzt begrenzt;
  Fehler haben eine bewusste Aktualisierung. Keine Pollschleife pro Token/Tastendruck.
- Bestätigte Dateien fehlten im Verlauf. Positive Userrow-Belege erzeugen jetzt
  genau eine Karte mit geschütztem Download, auch nach Neuladen.
- Die Werkzeugleiste kollidierte mit der Shellklasse. Eigener Klassenraum,
  begrenzte Dateiliste und horizontale mobile Leiste erhalten Eingabe und Stop.
- Titeldialog schloss bei bloßer Promiseauflösung. Er schließt jetzt ausschließlich
  nach belegtem applied des eigenen Versuchs; alter Erfolg schließt kein neues Öffnen.
- Modellbestätigung gilt nur der konkreten Auswahl; deferred bleibt vorgemerkt.
  Denktiefe unterscheidet Wunsch, Beobachtung, Klemmung und unbekannten Ausgang.
- Effort-Auswahl wurde im mobilen Toolbar-Scrollcontainer abgeschnitten.
  Vorhandenes Anchored-Portal, Fokus-/Escape-Rückgabe und echter Optionsklick geprüft.
- Laufender Turn blieb bei ausstehender Sendeantwort ohne Stopbutton.
  Stop folgt jetzt dem belegten Laufzustand; weiteres Senden bleibt gesperrt.
- Lange History verdrängte die Rückfragescrollfläche. Verlauf erhält mit flex-basis:0
  den Restplatz. Bei 390×500 sind Fragen tatsächlich beantwortbar und früh sicherbar;
  Eingabe und Stop enden bei 427px, Rückfragescrollfläche ist 123px hoch.
- Uploadbatches sind sequenziell und generationsgebunden. Wechsel A→B→A,
  Verbergen/Parking/Unmount entwerten den Rest; Secretfelder leeren sich bei Dialogen.

## Unabhängige Prüfungen und Wiederherstellung

Backend-R3 schließt frisches Profil, ersetztes HOME und verzögerte Historyquelle.
408 Hermesfälle, sechs Contracts sowie 86 alte und 52 neue unabhängige Kontrollgruppen
bestanden. Client-R2 schließt Textsubmitbereitschaft, Reasoning-Info-Race,
Setter-Deduplizierung und widersprüchliche Resultate nach Send.

Eine versehentliche breite Prettieraktion berührte den eingefrorenen Client.
80 eigene Dateien wurden aus seiner Patchhistorie rekonstruiert, 80/80 ASTs geprüft
und 79 geänderte Dateien bytegenau wiederhergestellt. Danach 80/80 R2-Hashes,
447 Featuretests und 412 externe Fälle erneut grün. Originalreports/Repros unverändert.

Root trennte Nachrichten-/Ausgabestyles fachlich vom Chatlayout. Vor der gezielten
Flexkorrektur waren alle 100 CSS-Regeln mit Deklarationen und Media-/Keyframekontexten
identisch. Drei bestehende Sidebar-Paginationfälle wurden in eine eigene Testdatei
verschoben; dieselben 12 Fälle bleiben grün. Keine Architekturbaseline erhöht.

## Aktueller Nachweis

- Vollständiger Typcheck einschließlich E2E, Architektur und isolierter Build grün.
- Vollständige Websuite: 1715/1715 in 260 Dateien grün.
- Abschließende gesamte Browserregression: 96/96 in 3,1 Minuten grün.
- Vier Breiten, 390×500, tatsächliche Klickpunkte, Tastatur, CustomLight mit allen
  Theme-Rollen und ReducedMotion über eigene Playwright-MCP-Registerkarte geprüft.
- Echter nativer 27-Byte-Upload, Statusread und exakter Download im vorhandenen Core
  mit eigener ruhender QA-Sitzung bestanden. Kein neuer Chatturn und keine globale
  Einstellungsänderung. Näheres in phase6-runtime-smoke.md.

Der isolierte Server läuft ausschließlich auf 127.0.0.1:19470, sein Build liegt unter
/tmp/wrapt-hermes-v2-web-XLkOcP. Produktionsdist blieb bei 13:59:15 unverändert.
Kein Produktionsneustart, Commit/Push oder Eingriff in Nutzerpreviews/Slots.
Die Browserdaten sind synthetisch; sie ersetzen keine echte Coreprüfung.

## Download und verbleibender Scope

Normaler Downloadlink verwendet den serverseitigen Content-Disposition-Header.
Der Browserfall wartet auf Abschluss und vergleicht die echten Bytes. Ein redundantes
HTML-download-Attribut hatte schon im isolierten HTML-Gegenfall vor dem HTTPrequest
canceled erzeugt. Der bestehende normale Linkpfad vermeidet diese zusätzliche Browser-
Interception. Kein Blob-Preview und keine Abschwächung des Bytevergleichs.

Das unabhängige Phase-6-UX-Verdikt ist PASS. Es folgen Phasen 7–11 einschließlich
nativer Arbeit, Verwaltung und abschließender Gesamtprüfung. Kleine UX-Punkte bleiben
für die ohnehin geplante Politur in Phase 9 erfasst.
