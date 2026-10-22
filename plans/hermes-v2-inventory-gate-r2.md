# Hermes V2: unabhängiges Phase-0-Gate, Runde 2

Stand: 16.10.2026. Scope: Dokumentenprüfung vor Phase 1.

## Urteil: PASS

Keine ungelösten Blocker oder High-Findings für den Start von Phase 1.
Die Freigabe umfasst ausschließlich Flag, Einstellungen, leere native Shell,
Routen, Standalone und den unveränderten klassischen Einstieg. Sie bestätigt
keine bereits implementierte oder laufzeitgeprüfte V2-Transportarchitektur.

## Geprüfte Grundlage

- Vollständiger Originalauftrag aus dem angehängten Implementierungs-Goal.
- `plans/hermes-v2-inventory.md`, aktualisierter konsolidierter Vertrag.
- `plans/hermes-v2-inventory-review.md`, erste unabhängige Prüfung samt Dateimap.
- Alle vier Research-Dateien: Wrapt, Protokoll, Design und UX.
- `plans/hermes-v2-progress.md` zur Phasenabgrenzung.

Die exakte Phase-1-Dateimap des ersten Reviews bleibt akzeptiert. Das kürzere
Inventar ersetzt diese durch eine Übersicht, ohne eine widersprechende
Implementierung vorzugeben. Insbesondere keine Erweiterung von
`legacyPageRoutes.ts`, `index.css` oder dem großen Contracts-Barrel in Phase 1.

## Erneut geprüfte High-Findings

- H1 ist aufgelöst. Der verbindliche Resolver prüft offene Requests und neue
  Entscheidungsfehler zuerst, danach relevante ungesehene Abschlüsse, jeweils
  vor Snooze, Settled und Pin. Der Abschluss muss neuer als `lastReadAt` und
  `max(snoozedAt, settledAt)` sein. Zeitbasis, fehlende Werte, erhaltene Pins,
  eindeutige Zeilen und die relevanten Kombinationstests sind festgelegt.
- H2 ist aufgelöst. Registrierte Pfade enthalten keinen `/wrapt`-Basename.
  Die Shell- und Persistenzflags beider Routen sind explizit. `?ui=classic`
  und bestehende Verwaltungs-Deep-Links haben Vorrang; Session-Links behalten
  bei deaktiviertem Flag ihre klassische Bedeutung. Direkte V2-Routen mounten
  bei false ausschließlich den Aktivierungseinstieg. Bestehender Storage-Key,
  Schema 2, explizite Migration von `defaultPage`, striktes Boolean und
  Storage-Abgleich ohne erneutes Persistieren sind festgelegt.
- H5 ist aufgelöst. Das Inventar verwirft den alten ACP-Vorschlag und die
  Erweiterung der Legacy-Routen ausdrücklich. Die bindenden Abschnitte zu
  Datenhoheit und Preferences ersetzen den vorgeschlagenen separaten Flagstore
  und clientlokale Organisationsdaten. `HermesShell` bleibt der gemeinsame
  Dispatcher für Route, Panel und Orbit. V2 verwendet Wrapt-Tokens und muss
  auch mit hellen Farbrollen geprüft werden. Die behauptete Fehlerfreiheit
  der entfernten nativen UI wird ausdrücklich nicht übernommen.

## Spätere Gates bleiben verbindlich

- H3/H4 sind ausdrücklich Phase-2-Auflagen: Request-Claims mit Principal,
  Live-ID, Epoche und Request-ID, atomare Antwortannahme, Schema-/Choice-/QID-
  Prüfung, Resynchronisierung nach konkurrierenden Antworten sowie reale
  Pfadprüfung vor schreibenden Create-/Attach-/Resume-/Submit-Operationen.
- M2 bis M6 sind aufgenommen: flüchtige Drafts, interne Eventnormalisierung,
  revisionsgebundene Organisationsdaten mit Principal-Fanout, getrennte
  Browser-/Turn-Lebenszyklen und begrenztes Cleanup. `desktop_contract` wird
  an Session-Info geprüft, nicht als erfundenes Ready-Feld verlangt.
- Standalone muss die benötigten Responsive-/Viewport-Eigenschaften selbst
  bereitstellen, soweit sonst die AppShell dafür sorgt. Dies bleibt Teil der
  Phase-1-Implementierungsprüfung, ohne jetzt Chattransport einzuführen.

Die Research-Dateien enthalten weiterhin überholte Vorschläge, etwa ACP,
clientlokale Organisationsdaten und Unseen innerhalb Active. Diese sind durch
die konkreten verbindlichen Entscheidungen im Inventar ersetzt und bilden
keinen zweiten Implementierungsvertrag. Auch der alte Bootstrap-Pfad aus dem
Wrapt-Research wird durch die akzeptierte Dateimap korrigiert.

## Evidenzgrenze

Diese Runde prüft ausschließlich die Dokumente und deren innere Vereinbarkeit
mit dem Auftrag. Frühere Test- und Smoke-Ergebnisse wurden nicht erneut
ausgeführt oder als eigene Laufzeitverifikation ausgegeben. Keine Produktdatei,
kein Dienst, Preview, Neustart oder Commit wurde verändert beziehungsweise
ausgeführt. Einziges geschriebenes Artefakt ist diese Gate-Datei.
