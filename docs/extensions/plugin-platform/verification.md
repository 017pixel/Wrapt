# Praxistest mit KI-Agenten

Stand: 22. Oktober 2026, Wrapt 2.18.0. Zwei freie OpenCode-Modelle bekamen
kurze fachliche Aufgaben sowie den Creator-Skill und dessen Referenzen.
Sie arbeiteten selbstständig mit lokalen Quellen gegen eine eigene
Testinstanz. Die persönliche Workbench blieb unberührt.

## Aufgaben und Ergebnisse

| Modell | Aufgabe | Ergebnis |
| --- | --- | --- |
| `opencode/glm-5.3-flash-free` | Fokusboard mit Aufgaben, Tags, Fälligkeit und Statusfiltern; Terminal umbenennen, Kontextmenü ergänzen und offene Aufgaben anderen Plugins anbieten | Funktionierende React-Seite, persistente Collections, RPC, Ressourcen und Dienst; reversible Navigationstransformation |
| `opencode/deepseek-v4.1-flash-free` | Projektjournal mit Projektwahl, Aufgaben, Dashboard-Zusammenfassung, regelmäßigen Projektständen und Journaleintrag beim Erstellen einer Notiz | Funktionierende Seite, Dashboard, RPC, drei Collections, Notiz-Hooks und geplanter Job; fand beim nachfolgenden Update einen Plattformfehler |

Beide Modelle korrigierten eigene Typ- und UI-Fehler anhand der tatsächlichen
Build-Diagnosen. Die verwendeten Prompts gaben keine Implementierung vor.
Die vollständigen Quellen blieben außerhalb des Wrapt-Quellcodes.

## Gefundene und behobene Plattformfehler

Das Projektjournal konnte nach dem ersten erfolgreichen Einsatz nicht mehr
aktualisiert werden. Auf Node 26.5.1 blieb das SQLite-Backup mit offenem WAL
hängen. Der Timeout beendete den alten Prozess; die Wiederherstellung trug
diesen toten Prozess erneut ein. Weitere Lifecycle-Aktionen scheiterten.

Die Plattform erzeugt nun vor dem Backup einen geprüften WAL-Checkpoint,
kopiert nach dem Abwarten laufender Handler über eine eigene Verbindung und
restauriert ausschließlich erreichbare Prozesse. Ein erneutes Aktivieren,
Update und Deaktivieren funktioniert auch nach einem Timeout. Fehlgeschlagene
Vorbereitungskopien werden aufgeräumt. Die Actions-API und CLI akzeptieren
auch die von der Registry angebotene Aktion `update`.

Die unabhängige Abschlussprüfung fand zusätzlich verspätete Schreibzugriffe
aus Cleanup-Callbacks. Dafür gibt es `lifecycle.beforeSnapshot`; nach dem
Snapshot weist die Datenhaltung Schreibzugriffe zurück und meldet den Fehler.
Vorbereitete Prozesse werden vor dem Löschen ihrer Datenverzeichnisse beendet.

## Unabhängig nachgeprüft

- Beide Agenten-Plugins liefen im Browser auf Desktop und 390 Pixel Breite.
- Das Journal behielt seine Aufgaben, Notizverknüpfungen und Projektstände
  nach dem korrigierten Versionswechsel und nach Deaktivierung/Reaktivierung.
- Eine neue Aufgabe ließ sich nach der Reparatur über das Browserformular anlegen.
- Automatisches Neuladen des Fokusboards erzeugte eine neue Laufzeitgeneration
  und behielt seine drei Testaufgaben.
- Dienste und Ressourcen waren aus anderen Plugin-Kontexten aufrufbar.
- Das dokumentierte Projektjournal wird im Integrationstest gebaut, aktiviert
  und mit echten RPCs, einem Notiz-Hook, einem Job und Dienstaufrufen geprüft.
- Contract-, Unit-, Lifecycle-, Migrations- und Recovery-Tests, Typprüfung,
  Lint und Architekturprüfungen decken die Plattform ab. App und Docs-Website
  wurden separat gebaut und mit Playwright-MCP geprüft.

Das sind zwei konkrete Autorenversuche, keine Zusage, dass jedes Modell jeden
Prompt fehlerfrei umsetzt. Typdiagnosen, unabhängige Funktionsprüfung und
explizite Vertrauensfreigabe bleiben Teil des Entwicklungsablaufs.
