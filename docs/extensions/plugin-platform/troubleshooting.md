# Fehlerbehandlung und Vertrauen

## Build-Fehler

Lies `diagnostics` aus dem Build oder im Inspektor. Jeder Eintrag nennt Datei,
optionale Zeile, Schwere und Meldung. Zuerst die tatsächliche SDK-Signatur
prüfen. Typische Fehler sind `record.data` statt `record.value`, erfundene
Context-Felder und npm-Imports statt der mitgelieferten SDK-Exporte.

Quellen sind auf 128 Textdateien mit jeweils 200 KB begrenzt. Symlinks,
Pfadtraversal und Einstiegspunkte ohne ausführbare JS-/TS-Endung werden abgelehnt.
Es gibt keine Installation von Plugin-Abhängigkeiten aus einem Paketregister.

## Aktivierung schlägt fehl

1. Build-Diagnosen lesen.
2. Explizites Vollvertrauen prüfen.
3. Aktive Abhängigkeiten und deren Versionen prüfen.
4. Setup-Fehler, Migrationen und Zeitlimits im Inspektor ansehen.
5. Host-Schreibzugriffe aus Setup in einen Job mit `runOnActivation` verschieben.

Eine fehlgeschlagene Vorbereitung lässt die bisherige aktive Version samt Daten
bestehen. Ein ungültiger oder fehlender Release-Slot wird nicht ausgeführt.
Ein abgestürzter oder zeitlich blockierter Prozess wird aus der aktiven Runtime
entfernt. Der nächste bewusste Start erfolgt über die Verwaltung.

## Leere oder defekte Oberfläche

Prüfe `GET /api/v1/plugins/runtime/code`. Ein UI-Einstiegspunkt muss aktiv sein.
Für eine eigene Seite sowohl `page` als auch `navigation` registrieren und einen
lokalen Pfad verwenden. Beiträge müssen IDs im eigenen Namensraum besitzen.
React immer aus `react` importieren. Lade- und Fehlerzustände selbst anzeigen.

Registrierte Komponenten brauchen echte Nutzeraktionen. Ein Button, der nur
eine Meldung zeigt, ersetzt keine gespeicherte Aufgabe oder ausgeführte Sammlung.
Teste nach Neuladen des Browsers, nach erneutem Aktivieren und nach Deaktivieren.

## Vertrauen und Safe Mode

Nur Workbench-Administratoren verwalten Codequellen und Vertrauen. Manifestfelder
können kein Vollvertrauen vergeben. Vertrauenswürdiger Servercode besitzt die
OS-Rechte des Wrapt-Benutzers, Browsercode den Zugriff der angemeldeten Oberfläche.
Der Prozess ist keine Sicherheits-Sandbox. Deklarative Entwürfe erhalten diesen
Codezugriff nicht.

`plugins.runtime.safeMode: true` in der Wrapt-Konfiguration verhindert beim
nächsten Serverstart ausführbare persönliche Plugins einschließlich ihrer UI.
Die Registry und Quellen bleiben erhalten. Ein notwendiger Workbench-Neustart
braucht eine ausdrückliche Nutzeranweisung; niemals einen laufenden Agenten oder
Nutzer-Preview ungefragt neu starten.

## Nachweise für Agenten

Ein Plugin ist erst fertig, wenn die fachliche Aufgabe mit tatsächlichen Daten
funktioniert. Prüfe mindestens:

- Build ohne Fehler und aktive richtige ID/Version;
- gültige sowie fehlerhafte RPC-Eingaben;
- gespeicherte Daten nach erneutem Laden;
- echte Buttons, Formulare, Listen und mobile Darstellung im Browser;
- aufgeräumte Beiträge nach Deaktivierung;
- bei Migrationen den Fehlerfall und Rollback mit eigener Datenkopie.

Prüfe in einer getrennten Instanz mit eigenen Daten und Ports. Nutzer-Previews,
Sessions, tmux-Sitzungen und die Hauptinstanz sind keine Testfixtures. Screenshots
gehören nach `/temp`, keine persönlichen Inhalte in Berichte kopieren.
