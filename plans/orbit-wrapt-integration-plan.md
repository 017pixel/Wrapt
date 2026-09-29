# Orbit als integrierter Wrapt-Arbeitsbereich

**Status:** Codeumsetzung abgeschlossen; Windows- und Live-Provider-Abnahmen offen und auf Nutzerentscheidung zurückgestellt  
**Stand:** 2026-09-26  
**Zielgruppe:** Neuer Umsetzungsagent mit delegierbaren Teilaufgaben  
**Projekt:** Wrapt-Monorepo

## 1. Auftrag und Ziel

Orbit soll sich wie ein Kernbereich von Wrapt anfühlen, nicht wie ein getrenntes Produkt. Benutzer
sollen nahtlos zwischen Orbit und eigenständigen Werkzeugseiten wechseln können. Es müssen dieselben
Terminals, Preview-Laufzeiten, Notes und Werkzeugzustände sichtbar sein. Canvas, Zoom, Vorschauen und
Flächenwechsel sollen auf Windows und macOS flüssig bleiben, ohne Funktionsqualität oder Nutzerdaten
zu verlieren.

Dieses Dokument umfasst alle bislang besprochenen Orbit-, Notes-, Terminal-, Preview-, Navigations-,
Werkzeug- und Performance-Verbesserungen. Der aktuelle Umsetzungsstand, Prüfbelege und offene
manuelle Messungen stehen in Abschnitt 12.

## 2. Verbindliche Nutzerentscheidungen

- Die bisherige Funktion „Workbench“ heißt in der sichtbaren Wrapt-Oberfläche überall **Orbit**.
  Wrapt als Produktname bleibt unverändert **Wrapt**.
- `/orbit` wird die kanonische Orbit-Adresse. `/workbench` bleibt als rückwärtskompatibler Einstieg.
- Der Arbeitsflächen-Schalter zeigt im geschlossenen Zustand ausschließlich den aktuellen Namen.
  Kein „Board“, keine Nummerierung, kein „1 von 7“ und keine Knoten-/Verbindungszahlen.
- Codex-, OpenCode- und Claude-Code-Limits bleiben kompakt in der unteren Leiste.
  Orbit-Zahlen, Sync-Details, Nutzungsdetails und Leistungswerte erscheinen im Infofenster.
- Quicknotes werden normale globale Notes ohne `orbitId`, Orbit-Backlink, Orbit-Filter oder
  automatische Platzierung im Orbit.
- Die Laufzeitverwaltung von `/previews` wird als Orbit-Seite eingebunden. Sie umfasst Laufzeiten,
  Logs und Ports; die Preview-Zielliste auf Projektseiten ist nicht gemeint.
- Doppelklick auf den Fenstertitel/die Fensterkopfzeile fokussiert das Fenster.
  Der Doppelklick darf nicht den Canvas zoomen oder Preview-Gruppen lösen.
- Wrapt-Feature-Namen, Daten und Aktionen bleiben deutsch und verwenden das bestehende Wrapt-Design.
- Diese Datei ist ein Plan; der konkrete Arbeitsauftrag wird durch die jeweilige Nutzeranweisung
  erteilt. Dienstneustart, Commit und Push benötigen gesonderte Freigabe.

## 3. Projektgrenzen und zu lesende Vorgaben

- Vor Änderungen `AGENTS.md`, `docs/architecture.md`, die darin angegebene Projektstruktur und die
  Skills `repo-kennenlernen`, `design-system-guide`, `mobile-design`, `versionierungen` lesen.
- Für Preview-Konfiguration und -UI zusätzlich `preview-config-json` lesen; vorhandene
  Preview-Sicherheitsregeln und Slots haben Vorrang.
- Farben ausschließlich aus dem `@theme`-Block von `apps/web/src/index.css` verwenden.
  Keine Gradients, Emojis oder neuen Hex-Farben in Komponenten.
- Mobile zuerst mitdenken: Touch-Ziele mindestens 44 × 44 px; Hover ist nie der einzige Zugang.
  Details auf Touch als Sheet/Drawer anbieten.
- Handgeschriebene Projektdateien unter 400 physischen Zeilen halten. Große Komponenten nach
  fachlicher Verantwortung aufteilen, keine `part1`-/`misc`-Module und kein Code-Golfing.
- Schema-/API-Änderungen zuerst in `packages/contracts`, dann Server und Web; Contracts vor den
  abhängigen Paketen bauen. Extension-Verträge zuerst in `packages/extension-contracts`.
- Nutzer-Previewserver, Slots und Sessions niemals stoppen, neu starten, schließen oder umbelegen.
  Keine Testserver auf Nutzerports starten. Nur isolierte Fixtures/Mocks oder freie Ports nutzen.
- Keine Neustartskripte oder Systemdienste ohne ausdrückliche Nutzerfreigabe ausführen.
  Neustarts können die aktive Coding-Session unterbrechen.
- Nicht committen/pushen ohne ausdrückliche Aufforderung. Keine fremden Änderungen stagen,
  stashen, verwerfen oder zurücksetzen.

## 4. Pflichtvorbereitung: aktuellen Arbeitsbaum verstehen

Der zuletzt geprüfte Arbeitsbaum enthielt zahlreiche Änderungen, darunter gestufte Änderungen,
Löschungen und neue Notes-, Terminal-, Preview-, Contract- und Navigationsdateien. Der nächste Agent
muss den Zustand zum Start erneut prüfen und Nutzerdaten/-änderungen erhalten.

1. `git status --short --untracked-files=all`, `git diff --stat` und `git diff --cached --stat`
   aufnehmen; untracked Dateien ausdrücklich einbeziehen.
2. Für jede Datei im eigenen Aufgabenbereich Index- und Arbeitsbaum-Diff lesen. Nicht pauschal alle
   Diffs in ein Modell oder einen Bericht kopieren.
3. Bestand in einer Matrix erfassen: vorhanden, teilweise vorhanden, fehlt oder weicht vom Plan ab.
   Vorhandene Umsetzung gezielt integrieren statt doppelt zu bauen.
4. Eigentümer für gemeinsame Contracts, Orbit-Routen und Node-Registry vor Paralleländerungen
   benennen. Keine zwei Agenten ändern gleichzeitig dieselbe Integrationsdatei.
5. Fundstellen von „Workbench“ klassifizieren. Sichtbare Bezeichnung des Features auf Orbit setzen;
   Wrapt-Produkttexte und persistierte/technische Kennungen nicht pauschal umbenennen.

Einstiegspunkte für die Prüfung: `apps/web/src/views/OrbitWorkbench.tsx`, `PreviewHub.tsx`,
`ToolRoute.tsx`, `components/ToolPanel.tsx`, `components/orbit/OrbitNodeView.tsx`,
`components/terminal/TerminalArea.tsx`, `stores/orbit.ts`, `stores/terminalWorkspace.ts`,
`stores/previewHub.ts`, `components/Sidebar.tsx`, `components/StatusBar.tsx`,
`extensions/builtins/navigation.ts`, `pageRoutes.ts`, `lib/routeModules.ts`, `apps/server/src/notes/`
und `packages/contracts/src/`.

## 5. Gemeinsame Ressourcen und Identitäten

Orbit-Knoten sind Ansichten und Anordnungen gemeinsamer Wrapt-Ressourcen, nicht Eigentümer eines
Prozesses, Preview-Servers oder Notes-Datensatzes.

| Ressource | Gemeinsame Identität | Orbit-Zugang | Eigenständiger Zugang |
| --- | --- | --- | --- |
| Terminal | stabile bestehende `runtimeId` plus Session-Metadaten | Terminal-Knoten | `/terminal?session=<runtimeId>` oder vorhandener Session-Link |
| Codex/Claude Code/OpenCode | jeweilige native Thread-/Session-ID | zugehöriger Werkzeugknoten | vorhandene Werkzeug-/Sessionroute |
| Preview | Projekt-ID, Preview-Ziel-ID sowie passende Slot-/Session-ID | Preview-Knoten/-Gruppe oder Orbit-Seite | gemeinsame Laufzeitverwaltung über `/previews` |
| Note | Notes-ID; keine Orbit-Zuordnung im Notes-Datensatz | globale Notes-Oberfläche oder explizite Ansicht | Notes-Seite |
| To-do | nach Migration Note-/Checklisteneintrag | Notes-Oberfläche | Notes-Seite |

- „Im Orbit öffnen“ fokussiert einen bereits vorhandenen passenden Knoten; sonst wird genau ein
  Knoten für dieselbe Ressource angelegt.
- „Eigenständig öffnen“ übergibt dieselbe stabile Identität. Ein Routenwechsel startet keine neue
  Ressource und verliert keinen Zustand.
- Ansicht schließen beendet niemals automatisch einen Terminalprozess oder Preview-Devserver und
  löscht keine Note.
- Terminal-Renderer dürfen ab- und wieder angehängt werden; Prozess, Ausgabe, CWD, Name, Pin und
  Exit-Status bleiben erhalten. Geometry-/Resize-Ownership konkurrierender Ansichten klären.
- OpenCode und andere eingebettete Web-Apps bleiben von PTY-Terminals getrennt und behalten ihre
  eigenen Session-IDs, Router, iframe- und WebSocket-Grenzen.
- Aktuelle Architekturtexte beschreiben persistente Routen, stabile Orbit-Laufzeit-IDs und
  gemountete iframes. Der Agent prüft diese Invarianten am aktuellen Code und erhält sie.

## 6. Umfang nach Fachbereich

### A. Orbit-Name, Route und Arbeitsflächen-Auswahl

1. Sichtbare Feature-Beschriftungen auf Orbit setzen: Desktop-/Mobile-Navigation, Titel,
   Breadcrumbs, Tooltips, Aktionen, Such-/Einstellungsbezeichnungen, leere Zustände und Meldungen.
2. `/orbit` als kanonische Route registrieren; `/workbench` Query/IDs erhalten und kontrolliert
   weiterleiten. Browser-Zurück/Vor, Reload, Deep Links, Route-Metadaten, Service-Worker-Fallback
   und Tests berücksichtigen.
3. Extension-, API-, Storage- und Präferenzschlüssel nur mit reversibler Migration umbenennen.
   Bestehende `wrapt.orbit.*`-IDs und Schlüssel wie `workbench` bleiben sonst intern stabil.
4. System-Select durch ein symmetrisches, Wrapt-gestyltes CSS-Menü ersetzen. Tastatur, Fokus,
   Escape, Outside-Click und Screenreader-Beschriftung unterstützen.
5. Anlegen, Umbenennen, Wechseln und Löschen auf Desktop und Touch prüfen.

### B. Infofenster und Statusleiste

1. Kleinen `i`-Auslöser oben links im Orbit einführen. Desktop: Hover oder Tastaturfokus zeigt ein
   Popover mit genau drei Stichpunkten. Klick öffnet die vollständige Detailfläche.
2. Touch: Tippen zeigt eine bedienbare Kurzansicht; die Detailansicht ist über eine klare Aktion
   als Sheet/Drawer erreichbar. Escape und sinnvoller Fokuswechsel schließen Desktop-Overlays.
3. Kurzinfo enthält Arbeitsflächenname, Knoten-/Verbindungszahl und klaren Synchronisierungsstatus.
4. Volle Info enthält Orbit-/Arbeitsflächenname, klaren Sync-Modus (synchron/asynchron),
   Speicherstatus, Synchronisierungsstatus und Konflikthinweis, Knoten/Verbindungen, Zoom,
   aktive Werkzeuge/Previews, kompakte Nutzungs- und Leistungswerte. Unklare Angaben dürfen nicht
   als „synchron“ beschönigt werden.
5. FPS über `requestAnimationFrame` und lange Tasks über PerformanceObserver nur bei geöffneter
   Detailansicht und maximal einmal pro Sekunde erfassen. Nicht unterstützte Browserwerte als
   „nicht verfügbar“ anzeigen. Keine globale Hochfrequenz-Polling-Schleife hinzufügen.
6. Untere Leiste behält Codex-/OpenCode-/Claude-Code-Limits kompakt. Orbit-Zahlen, Sync-Details und
   FPS wandern ins Infofenster; Limits bleiben ohne Öffnen grob erkennbar.

### C. Canvas, Zoom, Fenstertitel-Fokus und Layout

1. Doppelklick auf Titel/Kopfzeile fokussiert. Ereignispropagation zum React-Flow-Canvas stoppen;
   dessen vorhandener Doppelklick-Zoom auf freier Canvasfläche bleibt erhalten.
2. Preview-Gruppen-Auf-/Ablösen als separate Aktion bewahren; der Fokus-Doppelklick darf diese
   Geste nicht auslösen.
3. Fokusberechnung berücksichtigt nutzbaren Viewport, Toolbar, Inspektor, Sidebar, Mobile Safe
   Areas, Knotengröße, Zoomgrenzen und Boardgrenzen. Fenster zentriert zeigen und bis zu 90 % der
   verfügbaren Fläche nutzen, mit ungefähr 5 % sichtbarem Rand auf allen Seiten, soweit Geometrie
   und Zoomgrenzen es erlauben. Gespeicherte Knotenposition/-größe nicht verändern.
4. Fokus zusätzlich über sichtbaren Button, Tastatur und Touch anbieten. Animation abbrechbar und
   `prefers-reduced-motion` beachten.
5. Pan-/Scroll-/Pinch-Zoom an stabiler Ankerposition, ohne Sprünge oder unnötige Vollrenders.
   Zoom, Auswahl und Position beim Wechsel zwischen Orbit-Flächen erhalten.
6. Performance erst messen, dann optimieren: Renderer stabilisieren/memoizen, Store-Abonnements
   selektiv machen, Layout-/Viewport-Writes bündeln, Pointer-/Resize-Arbeit frameweise bündeln und
   nicht aktive Polls drosseln. Keine aktiven Terminal-/Iframe-Zustände verlieren.
7. „Neuer Bereich“: gestrichelte Begrenzung darf Text/Schaltfläche nicht schneiden oder überlagern.
   Notizbereich: Beispieltext, Editor, Abstände, Margins und Aktionen zentriert/lesbar; auf kleinen
   Flächen darf nichts abgeschnitten sein.

### D. Terminals, KI-Werkzeuge und CodeSnippet

1. Terminal-Handoff in beide Richtungen über dieselbe `runtimeId`: Orbit → Standalone über die
   Sessionroute; Standalone → Orbit über festgelegten Open-or-Focus-Auftrag. Keine Duplikate.
2. `kind`, `projectId`, CWD, Name und Sessionbezug bei Wiederöffnung korrekt übergeben. Strikte
   Session-Konfliktprüfungen nicht umgehen; Konflikt sicher melden oder nachvollziehbar auflösen.
3. Beim Routen-/Flächenwechsel Renderer neu verbinden dürfen, Runtime/Tmux/PTY und Ausgabe jedoch
   behalten. Konkurrenz um Terminal-Resize-Geometrie explizit regeln.
4. Zoomfehler für Terminal, Codex und OpenCode getrennt reproduzieren: CSS-Transformation,
   Browserzoom, iframe und xterm/FitAddon/ResizeObserver prüfen. Terminalschrift/-zellen dürfen
   beim Herauszoomen nicht größer werden; Resize-/Fit-Schleifen ausschließen.
5. Einheitliche Werkzeugfenster für Fokus, Kopfzeile, Ziehen/Resize, Lade-/Fehlerzustand,
   Schließen und „eigenständig öffnen“. CodeSnippet verbessern und Kopieren, Sprache/Formatierung
   sowie bestehende gespeicherte Snippets erhalten.
6. Codex-, OpenCode- und Claude-Code-Nutzungsanzeigen mit klarer Hierarchie, Limits/Resetzeiten,
   Lade-, Fehler- und Nichtverfügbar-Zuständen überarbeiten. Keine unnötigen Provider-Abfragen.

### E. Notes und To-dos

1. Notes bleibt die einzige kanonische Quelle. Orbit-Quicknote erzeugt eine normale globale Note,
   erscheint in Notes und erhält weder Orbit-ID/Backlink/Filter noch automatische Orbit-Platzierung.
2. Die vollständige Notes-Oberfläche im Orbit erreichbar und interaktiv machen: suchen, öffnen,
   editieren, verschieben und bestehende Notes-Aktionen. Gemeinsame Workspace-Komponente statt
   zweiter Notes-Implementierung.
3. Wenn Nutzer eine vorhandene Note ausdrücklich als Orbit-Fenster platzieren, darf das
   Orbit-Dokument eine Notes-ID als View-Referenz speichern; der Notes-Datensatz bleibt global und ohne
   Orbit-Verknüpfung. Quicknote-Erstellung allein platziert keine View.
4. To-dos in Notes-Checklisten/Task-Blöcke überführen. Inhalt, Status, Reihenfolge, Datum und
   unterstützte Zusatzfelder erhalten; keine Orbit-Zuordnung migrieren.
5. Migration transaktional und idempotent per stabiler Quell-ID: Expand → Migrate → Verify →
   Contract. Alte Quelle bis zum validierten Migrationsnachweis lesbar halten; Retry darf keine
   Duplikate erzeugen, Fehler darf keine Quelldaten löschen.
6. Notizfenster mit Beispieltext, Leerzustand, Rändern, Speichern/Fehlern und kleinem/mobilem
   Viewport prüfen; kein abgeschnittener Editor und keine überflüssigen Boxen.

### F. Preview-Verwaltung und Simulatorfläche

1. Alle vorhandenen `/previews`-Fähigkeiten in Orbit verfügbar machen: Projekt-/Zielauswahl,
   Laufzeitstatus, bisher vorhandene Start/Stop/Restart-Aktionen, Logs, Ports, Fehler und Diagnose/
   Konfiguration. `PreviewHub`-Logik, Store, Query-Cache und API wiederverwenden.
2. Orbit-Seite unter der Orbit-Navigation hinzufügen. Standalone `/previews` bleibt derselbe
   Zugang zur gemeinsamen Oberfläche. Projektseiten behalten ihre Preview-Zielliste.
3. Projekt-ID, Preview-Ziel-ID und Slot-/Session-ID sauber unterscheiden. Orbit-Knoten-/Fenster-ID
   nicht als Laufzeitidentität verwenden. Öffnen fokussiert vorhandenes Ziel; keine Slots duplizieren.
4. Verschachtelte Boxen durch eine klare Simulatorfläche ersetzen: einzelner Geräte-/Browserrahmen
   mit passendem Telefon-/Tablet-/Desktop-Viewport und Simulator-Kopfzeile. Keine dekorative
   Betriebssystemsimulation, die native Fähigkeiten vortäuscht.
5. Obere Bedienleiste für Preset (Telefon/Tablet/Desktop), freie Breite/Höhe, Hoch-/Querformat,
   Zoom, Aktualisieren, Öffnen im Browser und Geräteoptionen. Leiste/Simulator nach gewünschter
   Bedienung verschiebbar, Größenänderung kontrolliert; Aktionen bleiben auch per Touch/Tastatur
   erreichbar. Eine schmale Geräte-Statusleiste darf Teil des Rahmens sein, nicht Teil der Website.
6. Lokale Slot-iframes behalten. Ziehen, Skalieren, Fokus und Wechsel zwischen Orbit-Knoten,
   Orbit-Seite und Standalone dürfen kein unnötiges iframe-Remount, Slot-Neuanlegen oder Reset von
   Preview-localStorage/IndexedDB verursachen. Bestehende Cookie-Grenzen nicht anders versprechen.
7. Eine Web-Viewport-Simulation ist kein echtes iOS-/Android-Betriebssystem und kein nativer
   Emulator. T3 Code als Referenz für eigene Previewfläche, Presets und Zoomsteuerung verwenden,
   nicht dessen Desktop-WebView-Runtime übernehmen:
   <https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/preview.ts>.
8. Preview-Gruppen, Hover-Vorschauen und Toolfenster entschachteln, aber Slotbindung, Gruppieren,
   Geräteanpassung, externe URL-Sicherheit, Diagnose und Storage-Schutz erhalten.

### G. Sidebar und allgemeine Werkzeugergonomie

- Einklappzustand „Orbit-Projekte“ und „Werkzeuge“ unabhängig speichern; Dashboard und andere Routen
  dürfen diese Werte weder übernehmen noch überschreiben. Reload und Mobile-Drawerwechsel erhalten
  den Zustand; Legacy-Werte gezielt migrieren.
- Alle hinzufügbaren Orbit-Werkzeuge auf Kopfzeilen, Innenabstand, Fokus, Resize, Loading/Error,
  Persistenz, Mobile und Wechsel Orbit↔Standalone prüfen.
- Bestehende Features im Toolbar/Palette/Groups/Edges/Projects/Usage erhalten. Keine kosmetische
  Umgestaltung darf Aktionen oder Tastaturpfade entfernen.

## 7. Umsetzung und Zuständigkeiten

Die Umsetzung wurde mit delegierten Fachagenten für Terminal/Handoff, Notes/Aufgaben und Preview/
Geräteansicht parallelisiert. Die Orbit-Shell und gemeinsame Verträge blieben zentral koordiniert;
überlappende Integrationsdateien wurden abgestimmt. Unabhängige Reviews deckten Orbit-Flows,
Preview-Oberfläche, Notes-Datenintegrität und Performance-Messmethodik ab. Der Performance-Audit
bleibt wegen fehlender Windows-Hardware und unvollständiger Messläufe offen.

## 8. Abfolge und Abhängigkeiten

1. **Bestandsaufnahme:** Arbeitsbaum/Diffs, vorhandene Features, persistente IDs, Previewgrenzen,
   Zielhardware und Browser aufnehmen; Baseline messen.
2. **Schnittstellen festlegen:** Ressourcen-IDs, Öffnen/Fokussieren, Notes-Ansicht, Orbit-Seitenroute,
   Preview-Ziel und Contract-Eigentümer bestimmen.
3. **Parallele Welle:** Hauptagent baut Shell/Kompatibilität; die drei Fachagenten arbeiten getrennt
   an Terminal, Notes und Preview. Geteilte Dateien nur nach expliziter Zuständigkeitsabstimmung.
4. **Integration:** Adapter in Node-Registry/Palette einhängen; Orbit-Seiten und Standalone teilen
   dieselben Stores/Queries. Migrations- und Deduplizierungsfälle prüfen.
5. **Performance-Welle:** unveränderte Fixtures erneut messen. Erst Profile lesen, dann gezielte
   Ursachen optimieren. Zielverfehlungen offen mit Daten protokollieren.
6. **Abschluss:** Regressionen, Barrierefreiheit, Desktop/Mobile, Changelog/Version, Projektgates
   und unerledigte Freigaben prüfen.

## 9. Messmatrix und Performance-Gates

Vorher und nachher auf Windows-PC und MacBook messen. Pro Lauf OS, Browser/Version, Viewport,
`devicePixelRatio`, Energiemodus, Fixture, aktive Knoten/iframes und Wiederholung notieren.
Mindestens fünf Läufe je Szenario, Median/p95/p99 im Ergebnisbericht. Keine Nutzer-Preview als
Fixture. Canvas-Perzentile sind nur gültig, wenn das Dokument sichtbar ist und jede Geste mindestens
90 % RAF-Zeitabdeckung erreicht; der Harness prüft beides.

| Größe | Verfahren | Gate |
| --- | --- | --- |
| Canvas-Framezeit | Fünf Gesten à sechs Sekunden: Pan, Wheel-Zoom, CDP-Pinch, Drag und Resize; sichtbares Dokument, mindestens 90 % RAF-Abdeckung | mittleres Board p95 nahe/unter 16,7 ms bei 60-Hz-Zielgerät; kein wiederholter Stillstand >100 ms |
| Stress-Canvas | reproduzierbare Fixture: 80 Knoten, 60 Kanten und festgelegte Previewzahl | p95 höchstens 33,3 ms; keine Fokus-/Gesten-/Datenfehler |
| Flächenwechsel | 10 warme Orbit↔Notes-Wechsel; Browsermessung vom Klick bis aktive Zielroute und erstem Frame; kalte Erstöffnung separat | warmes p95 höchstens 250 ms; kalte Zeit separat; keine unbegründete Regression zur Baseline |
| Preview-Wechsel | je 10 Orbit-Knoten ↔ Orbit-Seite ↔ `/previews`; IDs, iframe-Mount/Navigation und Slotzahl prüfen | keine unerwartete Session/Slot; Preview bleibt bedienbar und Zustand bleibt erhalten |
| Preview-Start | isolierte lokale Fixture; Start bis Status „bereit“ und erste gerenderte Seite | Median/p95 gegen Baseline; Start-/Fehlerbehandlung nicht verschlechtern |
| Terminal | feste Ausgabe/TUI bei Canvaszoom 0,1×/0,25×/0,5×/1×; Handoff je Richtung 10-mal | Schrift wächst beim Herauszoomen nicht; genau eine Runtime; CWD/Ausgabe bleiben erhalten |
| Eingaben | 10 Flächenwechsel, Fokusaktionen, Fensterbewegungen/Resize und Note-/Knotenerstellungen | keine verlorenen Eingaben, falschen Fokusse, doppelten Datensätze oder Langhänger |
| Langaufgaben | PerformanceObserver `longtask` soweit verfügbar; Anzahl/Dauer dokumentieren | keine wiederholten blockierenden Langaufgaben bei Canvasinteraktion |

Zusätzlich eine typische kleine Fläche messen. FPS im Infofenster ist Diagnose, kein Ersatz für
Traces. Speicher nur messen, wenn die Browser-API verfügbar ist; inkompatible Browserwerte nicht
zusammenwerfen. Performance darf nicht allein aus einer FPS-Zahl oder einem Einzelgerät abgeleitet
werden.

## 10. Verifikation und Abschlussgates

### Automatisiert

- Unit/Integration: Route-Alias/Queryerhalt, Menü, Info, unabhängige Sidebar-Persistenz,
  Fokusberechnung/Eventpropagation, Terminal-Handoff/Runtime-ID, Notes-Migration/Retry und
  Preview-Open-or-Focus-/Slot-Identität.
- Komponenten: Tastatur-/Touchbedienung, Info-Hover/Klick, Notes-Speichern/Leerzustand,
  Simulatorkontrollen und Loading-/Error-/Offlinezustände.
- E2E: `/orbit`, `/workbench`-Weiterleitung, Terminal- und Preview-Handoff in beide Richtungen,
  Notes-Zugriff, Kopfzeilen-Doppelklick und getrennte Sidebar-Zustände in Desktop-/Mobile-Viewports.
- Regression: Knoten/Kanten/Groups/Snap/Zoom/Palette/Export/Persistenz/Sync, Preview-Sicherheit/
  Slots, Projektziele, Terminal-Pins/Splits und Notes-Suche/Editieren erhalten.
- Projektvorgaben: `pnpm typecheck`, passende relevante Tests, bei Bedarf `pnpm lint`,
  `pnpm architecture:file-lines`; Contracts vor abhängigen Paketen bauen. E2E nach bestehender
  Browserverifikationsvorgabe. Nutzer-Previewserver nie als Testfixture verwenden.

### Manuell

- Auf Windows und MacBook Browser/Version/Viewport/Skalierung protokollieren und Messmatrix ausführen.
- Touch-Ziele und Bedienung im kleinen Viewport prüfen; Hover-only-Aktionen ausschließen.
- Doppelklick auf Fensterkopf, freien Canvas und Preview-Gruppenkopf getrennt testen.
- Terminal-Ausgabe bei Zoomstufen und beide Handoff-Richtungen mit persistenter Sitzung prüfen.
- Preview mit interaktivem Zustand zwischen allen Einstiegen bewegen, ohne Nutzer-Devserver/Slot/
  Storage zu stoppen, zu löschen oder neu zuzuweisen.
- Kein Dienstneustart ohne ausdrückliche Nutzerfreigabe.

## 11. Definition of Done

- [x] Sichtbare Feature-Namen lauten Orbit, Wrapt bleibt Wrapt, `/orbit` ist kanonisch und alte
      `/workbench`-Links funktionieren nachweislich.
- [x] Arbeitsflächen-Auswahl ist zugänglich, CSS-gestaltet und zeigt nur den aktuellen Namen.
- [x] Info-Kurzansicht mit drei Punkten und Vollansicht auf Desktop/Touch; synchroner/asynchroner
      Syncstatus, Knoten, Verbindungen und FPS-Details sind nicht mehr in die Bottom Bar gequetscht.
- [x] Bottom Bar enthält weiterhin kompakte Codex-/OpenCode-/Claude-Code-Limits.
- [x] Orbit-Knoten und Standalone-Terminals öffnen dieselbe Runtime; CWD, Ausgabe, Session, Pin und
      Fokus/Resize-Ownership bleiben korrekt.
- [ ] Terminal-/Codex-/OpenCode-Zoomverhalten ist providerbezogen abgenommen. Ein isolierter
      Chromium-E2E prüft den echten Shell-xterm im Orbit über acht Zoomänderungen; der Codex-Knoten
      verwendet denselben TerminalArea-Rendererpfad. Ein weiterer isolierter Chromium-E2E prüft
      den OpenCode-iframe-Einbettungspfad mit lokaler Fixture; Live-Codex-TUI und echter
      OpenCode-Dienst bleiben mangels isolierter Providerdienste ungeprüft.
- [x] Quicknotes sind globale Notes ohne Orbit-Zuordnung; vollständige Notes-Oberfläche funktioniert
      im Orbit; Taskmigration ist idempotent und erhält die gemappten Daten.
- [x] CodeSnippet und die Codex-/OpenCode-/Claude-Code-Werkzeuge sind überarbeitet, ohne bestehende
      Aktionen oder Fehlerzustände zu verlieren.
- [x] `/previews`-Laufzeitverwaltung ist Orbit-Seite und Standalone-Einstieg in dieselbe Oberfläche.
      Reiner Wechsel erzeugt keine neue Preview-Session oder Slotbelegung.
- [x] Simulator hat klare Gerätefläche, Statusrahmen und bedienbare Werkzeugleiste für Preset,
      Maße, Orientierung, Zoom und Aktionen; lokale iframe-Zustände bleiben bestehen.
- [x] Doppelklick auf Fensterkopf fokussiert/zentriert bis ca. 90 % der verfügbaren Fläche mit Rand,
      ohne Canvaszoom oder Gruppen-Ablösen; Touch-/Tastaturalternative ist vorhanden.
- [x] Neuer Bereich und Notizen sind korrekt zentriert/abgestanden; gestrichelte Linie schneidet
      keine Beschriftung; kleine Viewports schneiden keinen Editor ab.
- [x] Sidebar-Zustände sind unabhängig; vorhandene Orbit-/Preview-/Notes-/Terminal-Funktionen
      bestehen Regressionprüfungen.
- [ ] Vorher/Nachher-Protokoll hat Windows und macOS, Fixture, fünf Läufe, Median/p95/p99,
      gültige Framezeit, Flächenwechsel und Preview-/Terminal-Zustandsnachweis. Ein gültiger
      Mac-Fünferlauf liegt vor; Windows-Messung und Vorher-Baseline fehlen.
- [x] Neue Module bleiben unter 400 Zeilen; bereits dokumentierte historische Ausnahmen wurden
      durch diese Änderungen nicht vergrößert. Typecheck, relevante Tests und Architektur-Gates
      sind grün; Changelog-/Versionsregeln sind angewandt.
- [x] Keine Nutzerterminals, Previewserver, Slots, Notes oder fremde Arbeitsbaumänderungen wurden
      unautorisiert beendet, überschrieben, verworfen oder zurückgesetzt.
- [x] Keine Neustarts, Commits oder Pushes ohne erforderliche Nutzerfreigabe ausgeführt.

## 12. Abschlussbericht des Umsetzungsagenten

**Umsetzung:** Orbit ist kanonisch unter `/orbit`; Navigation, Arbeitsflächenwahl, Infofläche,
Statusleiste und Fensterfokus sind integriert. Notes/Tasks, Terminal-Handoff, Werkzeugfenster,
Preview-Verwaltung samt Simulator und unabhängige Sidebar-Zustände nutzen gemeinsame IDs und
Oberflächen. Notes-/Task-Migrationen, Version `1.22.0` und Changelog sind enthalten.

**Prüfungen:** Web-Unit-Suite 720 Tests/135 Dateien bestanden; isolierte Browser-E2E 17/17.
Die Server-Suite bestand nach der macOS-Pfadkorrektur mit 670 Tests in 105 Dateien; 2 Tests
wurden übersprungen. Die gezielten Pfad-/Allowlist-Suiten bestanden mit 60 Tests in 5 Dateien.
Notes-spezifische Servertests bestanden mit 18 Tests in 4 Dateien; Contracts mit 66 Tests in
12 Dateien und Extension-Contracts mit 454 Tests in 29 Dateien. `pnpm typecheck`, `pnpm lint`,
`pnpm architecture:file-lines`, `pnpm architecture:extensions` und `git diff --check` bestanden.
Die Pfadprüfung normalisiert auf macOS nur bestätigte System-Aliase (`/var`, `/tmp`, `/etc`);
`lstat`-/`realpath`-Grenzen bleiben erhalten. Der Performance-Harness schreibt jetzt atomare
Zwischenstände, protokolliert Wiederholungsfortschritt und verwirft eine Geste direkt, wenn
Sichtbarkeit oder die geforderte RAF-Abdeckung fehlen. Die fünf Wiederholungen, zwei Szenarien
und fünf Gesten à sechs Sekunden bleiben unverändert; der stabile Fünferlauf wurde ausgeführt und
ist unten mit seinem Ergebnis dokumentiert.

**Performance:** Ein erster Fünferlauf ist wegen unvollständiger RAF-Abdeckung nur Diagnosematerial.
Einzelmessungen deckten etwa 2–9 % der Gestenzeit ab (gefordert: 90 %). Ein späterer Bericht zeigte
einen kurzzeitigen React-Flow-DOM-Zwischenstand: nach `toHaveCount(8)` lieferte ein einzelner
separater Count null, die nächste atomare Abfrage zeigte wieder 8; Serverbackup und Folgesamples
waren korrekt. Der Harness wartet jetzt auf einen atomaren Fixture-Snapshot, der über drei
RAF-Frames stabil ist, und validiert zusätzlich Knoten/Kanten/iframes. Der gültige Fünferlauf
`/tmp/orbit-perf/mac-chrome-2026-09-26-1740-stable-fixture.md` erfasste auf einem MacBook Air M5,
Darwin 27, Chrome 153.0.8010.53, 1440×960, DPR 1, bei 55 % Akkuladung und aktivem Low-Power-Modus
für alle fünf Wiederholungen exakt 12/8/0 sowie 80/60/1. RAF-Abdeckung lag bei mindestens
99,6 %, es gab keine Langaufgaben über 100 ms. Stress-p95 lag bei 18,1–18,4 ms und bestand das
33,3-ms-Gate; kleine Canvas-p95 lag je Geste bei 18,2–18,6 ms und verfehlte das 16,7-ms-Gate.
Orbit↔Notes-p95 betrug 192,9 ms; Preview-Routen-p95 134,9/72,74/120,55 ms. Der Harness-Lauf ist
damit eine gültige Messung, aber keine bestandene Performance-Abnahme. Ein Vorher-Vergleich unter
gleichem Energiemodus, eine Messung am Netzteil und Windows-Messungen fehlen.

**Gezielte Minimap-Optimierung und Wiederholungsmessung:** Der React-Flow-Viewport abonnierte
die Minimap direkt; dadurch wurde sie bei jeder Pan-/Zoom-Aktualisierung neu gerendert und die
SVG-Knotenliste erneut aufgebaut. Die Knoten-Renderliste liegt jetzt in einer memoisierten
Komponente und wird bei unveränderter Board-Knotenreferenz übersprungen. Der isolierte stabile
Fünferlauf danach (`/tmp/orbit-perf/mac-chrome-2026-09-26-post-minimap.md`) behielt mindestens
99,69 % RAF-Abdeckung und keine >100-ms-Langaufgaben. Das kleine Canvas-p95 blieb bei 18,2–18,6 ms,
das Stress-p95 bei 18,1–18,4 ms; damit ist in dieser Messung kein messbarer p95-Gewinn erkennbar.
Das Stress- und Routenverhalten besteht die Grenzwerte, das kleine Canvas-Gate bleibt offen.
Die Rohdaten wurden gespeichert; der Lauf endete erwartungsgemäß mit fehlgeschlagenem
16,7-ms-Gate. Diese Änderung reduziert React-Arbeit bei Viewport-Updates, belegt aber keine
Verbesserung der gemessenen Framezeit.

Nach der Minimap-Änderung bestanden der fokussierte Minimap-Test, Web-Typecheck, ESLint,
`pnpm typecheck`, `pnpm lint`, `pnpm architecture:file-lines`, `pnpm architecture:extensions`
und `git diff --check`. Der isolierte Orbit-Performance-Lauf speicherte alle Rohmessungen und
verfehlte ausschließlich das weiterhin offene kleine Canvas-p95-Gate. Ein zusätzlicher isolierter
Chromium-Browsertest für echte Shell-Ausgabe bei Orbit-Zoom bestand (1/1); der Test steht in
`tests/e2e/terminal-orbit-zoom.spec.ts` und die Abdeckung in `docs/terminal-zoom-abdeckung.md`.

**Offen:** Windows-Messung (auf Nutzerwunsch vorerst zurückgestellt), gültige Mac-Vorher-Baseline
und Netzbetrieb-Vergleich, Preview-Start-Vorhervergleich sowie Live-Zoomprüfung mit echtem Codex-
und OpenCode-Provider. Der isolierte Chromium-E2E `tests/e2e/terminal-orbit-zoom.spec.ts` besteht
mit echter Shell-Ausgabe über acht Orbit-Zoomänderungen; die xterm-Schriftgröße kompensiert jeweils
den Canvas-Zoomfaktor. `tests/e2e/orbit-opencode-zoom.spec.ts` besteht mit lokaler iframe-Fixture;
ein echter OpenCode-Dienst wurde nicht gestartet. Codex teilt den geprüften TerminalArea-Pfad.
Der gültige Mac-Fünferlauf erfüllt das Canvas-Gate für kleine
Boards mit 18,2–18,6 ms p95 noch nicht (Ziel: 16,7 ms); Stress-Canvas, Flächenwechsel und
Preview-Routen bestehen ihre jeweiligen Grenzwerte.

Ein isolierter HEAD-Baseline-Versuch lief auf Akku bei aktivem Low-Power-Modus an. Er wurde auf
Nutzerwunsch nach der ersten vollständig gespeicherten Wiederholung beendet; der Zwischenstand
`/tmp/orbit-perf/mac-chrome-2026-09-26-head-canvas.progress.json` ist keine gültige Fünfer-Baseline.
Es werden auf Nutzerwunsch keine weiteren Performance-Messläufe gestartet.
Der Nutzer bewertet die erreichte Performance als gut und beendet die Messungen; die dokumentierten
Werte und das noch offene numerische Klein-Canvas-Gate bleiben unverändert.

**Preview-Start:** Ein separater isolierter E2E-Fünferlauf startete eine temporäre lokale
Node-Fixture jeweils als gestoppten Prozess. Auf Darwin 27.0.0/arm64 mit Chrome 153.0.8010.12,
1280×720 und Akku 52 % bei aktivem Low-Power-Modus lag „Start“ bis Zustand „Läuft“ bei Median
229,2 ms/p95 349,6 ms/p99 352,9 ms. Bis zum ersten gerenderten SPA-Inhalt waren es Median
399,7 ms/p95 550,5 ms/p99 560,6 ms. Der Prozess war je Wiederholung beendet; Betriebssystem- und
Dateicaches waren nicht geleert. Ein vergleichbarer Vorher-Lauf fehlt, daher sind diese Werte
Messbasis und keine bestandene Vorher/Nachher-Abnahme. Rohdaten: `/tmp/wrapt-preview-start-NraX0f/preview-start-performance.json`.
Der Nutzer hatte `restart-all.sh` ausdrücklich abgelehnt; es wurde kein Neustartskript ausgeführt.
Bei einem isolierten Messversuch wurde versehentlich `pnpm build` im Haupt-Repo gestartet und
abgebrochen; dadurch lief der Contract-Build unvollständig. `@wrapt/contracts` wurde anschließend
gezielt neu gebaut. Der `tsx watch`-Prozess läuft weiter und Port 3010 antwortete danach wieder mit
HTTP 200; es wurde kein Dienst manuell gestartet. Es gab keinen Commit oder Push.

**Abschlusskorrekturen:** Das eigenständige Notes-Fenster wechselt bei Breadcrumb- und
Unterseitenauswahl jetzt zur gewählten Notes-ID; eine leere Auswahl führt zurück zur Übersicht.
Komponententests (2/2) und der isolierte Chromium-Test im Viewport 390×844 (1/1, zweimal
ausgeführt) bestehen. `WRAPT_E2E_PORT` steuert nun auch dann die Zieladresse, wenn keine
`WRAPT_E2E_URL` gesetzt ist.

Im Preview Hub bleibt die per `preview`-ID gewählte Konfiguration erhalten, auch wenn mehrere
Ziele denselben Port nutzen. URL-only-Ziele werden extern geöffnet und nicht an lokale Orbit- oder
Simulator-Flows übergeben. Die gezielten Preview-Hub-Tests bestehen (4/4). Der OpenCode-Knoten
öffnet seine eigenständige Route auch ohne Runtime-ID; Anzeige und Abfrage der Limits verwenden
dieselbe 30-Sekunden-Angabe. Die gezielten OpenCode-Tests bestehen (10/10).

Die Abschlussprüfungen `pnpm typecheck`, `pnpm lint`, `pnpm architecture:file-lines`,
`pnpm architecture:extensions` und `git diff --check` sind grün. Auf Nutzerwunsch wurden danach
keine weiteren Performance-Messungen gestartet. Windows-Messung, Mac-Vorher-Baseline und Live-
Codex-/OpenCode-Providerprüfung bleiben ausdrücklich offen. Es wurde kein Neustart ausgeführt.
