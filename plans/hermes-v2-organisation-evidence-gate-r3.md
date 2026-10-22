# Hermes V2: unabhängiges Beleg-Gate R3

Stand: 16.10.2026. Geprüft wurde der konsolidierte Organisations-Handoff mit
275 Zeilen gegen den Originalauftrag, Originalreview, R2-Gate, Attention-Research
und Evidence-Addendum. Alle vier bisherigen Review-/Research-Dateien vollständig
gelesen, die nachfolgend genannten Contracts und Quellpfade gezielt selbst geprüft.
Hermes-Quellpfade beziehen sich auf `/home/bbecker/.hermes/hermes-agent/`.

## Verdikt: NEEDS FIXES, ein Medium vor dem Architektur-PASS

Die bisherigen High-Findings sind auf Entwurfsebene geschlossen. Der neue Ansatz
ist mit den vorhandenen APIs grundsätzlich umsetzbar: gemeinsame inhaltsfreie
Quellen/Fakten, private ACKs und Organisation, begrenzte Handles statt eines
MAX-Cursors. Ein konkreter Lebenszyklus für dauerhaft gespeicherte, später nicht
mehr projizierbare Livefakten fehlt noch. Keine weiteren High-/Medium-Widersprüche
im beauftragten Abgleich nachgewiesen. Das ist ausschließlich ein Entwurfsurteil;
Phase 2 bleibt unberührt, Phase 3/4 werden hier weder integriert noch freigegeben.

## R3-M1: Abgelaufene Belege können dauerhafte Live-Attention unbestätigbar machen

**Ort:** Handoff 64–70, 89–95, 100–125 und 208–228.
Fakten sind dauerhaft, die Handle-Registry ist kurzlebig und nach Restart leer.
Bei ungültigem Handle verlangt der Entwurf eine frische belegte Chatprojektion.
Er definiert keinen Ersatzpfad, wenn die originale Livequelle ohne persistierten
Row-Zeugen aus Snapshot, History und Replay verschwunden ist. Das betrifft gerade
die ausdrücklich unterstützten Eventquellen und entscheidungsbedürftigen Fehler.

**Tatsächlicher Quellbeleg:** `tui_gateway/session_auto_continue.py:563` emittiert
terminale Fehler als `message.complete` ohne `persisted_turn`. Laut
`tui_gateway/prompt_turn.py:977` kann nur das retained Inflight den Fehler tragen.
`tui_gateway/event_replay.py:22` und `:29` zeigen Prozess-Epoche und begrenzten
512-Event-Ring; Eviction ist ab `:114` ausdrücklich möglich. Eine dauerhafte
Wiederholung des ursprünglichen Ereignisses ist somit nicht garantiert.

Wrapts `hermes-v2-events.ts:8` und `hermes-v2-sessions.ts:42` liefern im Snapshot
keine Identität des terminalen Fehlerereignisses. `session-service.ts:150` und
`snapshot-tools.ts:9` projizieren aus dem Replay laufende Tools, keine Liste
abgeschlossener Fehler. `normalize-events.ts:29` behandelt Liveabschlüsse getrennt
von History. Das optionale Belegfeld allein schafft keinen späteren Quellzeugen.
Gemeint sind jeweils Dateien unter `packages/contracts/src/` beziehungsweise
`apps/server/src/hermes/v2/`, keine Behauptung, Phase 4 sei schon implementiert.

**Gegenbeispiel:** Ein als `decision-error` zugelassenes Ereignis E wird gemeinsam
gespeichert. B hat den Chat geschlossen und bestätigt E deshalb korrekt nicht.
Der Handle verfällt oder Wrapt startet neu; inzwischen wurde E im Hermes-Replay
verdrängt und ein weiterer Turn hat das retained Inflight ersetzt. B öffnet den
Chat: History enthält keinen identifizierbaren Fehler-Row zu E, der Fakt bleibt
aber bestehen. Weder Reload noch Read mit frischen Historybelegen kann E exakt
bestätigen. Resolver 1 hält Needs input fest; Settle darf diesen Fehler ebenfalls
nicht verbergen. Ein alter oder fremder Owner-Handle ist zu Recht keine Lösung.

**Kleinste Korrektur:** Den Lebenszyklus solcher Eventquellen explizit festlegen.
Beispielsweise im aktiven Chat einen aus gespeicherten inhaltsfreien Fakten
abgeleiteten, eindeutig als historischen Hinweis bezeichneten Fehlerbeleg zu E
projizieren, mit frischem Handle und fester Source-Menge. Das bestätigt nur diesen
sichtbar dargestellten Hinweis, keine verlorene Antwort und keinen erledigten
Request. Für nicht rekonstruierbare Antwortinhalte alternativ eine offen sichtbare,
organisierbare Abdeckungslücke definieren, ohne einen Read zu behaupten. Einen
konkreten Pfad samt Contract wählen; keine Transcriptkopie, pauschale ACK-Aktion
oder neue Upstream-Receipt-Architektur ergänzen.

**Pflichttest:** E ohne Row-Zeugen, Principal B ohne ursprünglichen Handle,
TTL/Eviction/Restart und fehlendes Replay; anschließend Chat öffnen und den
festgelegten Rückweg vollständig ausführen. E darf keine unauflösbare Attention
erzeugen; ungesehene andere Quellen, Requests und private ACKs bleiben erhalten.
Das ist eine offene Entwurfsentscheidung, keine Forderung nach Produktcode jetzt.

## Explizit bestätigte Altfixes

**Original-H1 und Addendum-H1 geschlossen, Handoff 87–132.** Read bestätigt
eingefrorene Source-Mengen aus derselben Row-/Eventprojektion. Snapshot A,
neuer Fakt B, Read(A) bestätigt ausschließlich A, unabhängig von Ingest-Reihenfolge
oder gleicher Millisekunde. Nur B dargestellt bestätigt keinen früheren Fakt A.
ACK vor Ingest bleibt darstellbar; weder Metadaten-Cursor noch HTTP-Zeit fungieren
als Read-Grenze. Die notwendige öffentliche Belegbrücke ist jetzt spezifiziert.

**Addendum-H2 geschlossen, Handoff 16–32 und 183–204.** Live-Turnende, neue
persistierte Antwort und offener Abgleich sind getrennt. Kein `running=false`
aus einer REST-Antwort, keine universelle Offline-Fertig-Zusage. `is_active`,
Nachrichtenzähler und permissiver Lifecycle werden ausdrücklich ausgeschlossen.
Recovery ohne Finish-Reason und unbekannte Writer bleiben unbestätigt.

**Addendum-M1 geschlossen, Handoff 34–58.** Echte physische Adresse ist `id`.
Scope und bewiesener Branchkontext begrenzen UID-/Eventidentitäten. Gleiche UID
belegt logische Kopien; gerichtete absorbed-Abdeckung ist keine Gleichheit
mehrerer Abschlüsse. User-Merges werden nicht zu Assistant-Fakten. Root/Tip wird
nur entlang belegter Continuation verbunden, Branch/Fork bleibt getrennt.
Row-Reuse ohne UID und unbewiesene Storewechsel bleiben identity-unknown.

**Original-M1 geschlossen, Handoff 217–234.** Spätere relevante Fakten oder neue
Abdeckung entwerten Snooze/Settle dauerhaft, unabhängig vom späteren Read.
Ein danach neu gesetzter Organisationszustand wirkt wieder. Unentscheidbar späte
Fakten bleiben konservativ sichtbar; Undo darf diesen Wake nicht zurücksetzen.

**Original-M2 geschlossen, Handoff 225–235.** Volle aktuelle Pin-Mitgliedschaft,
Listenrevision und betroffene Zeilenrevisionen werden atomar geprüft. Pin/Unpin,
Reorder und deren Undo erhöhen die Listenrevision. Stale Reorder/Undo wird
abgelehnt; ACKs, Fakten und Abdeckung werden beim Restore nicht zurückgesetzt.

**Original-M3 geschlossen, Handoff 60–85 und 199–204.** Fakten und Abdeckung sind
gemeinsam, Reads/Pins/Snoozes/Undo privat. Gemeinsamer Fanout umfasst berechtigte
Summary-only-/Snoozed-Manager; private Invalidierungen bleiben Owner-gebunden.
Das verlangt eine spätere Ergänzung des vorhandenen Pools, keine neue Hermes-DB.

## Abgleich mit den tatsächlichen Schnittstellen

REST `hermes_cli/web_routers/sessions.py:723` liefert paginierte Nachrichten samt
Profile-Stempel; `hermes_state_messages.py:1319` erhält `id`, UID und Finish-Reason.
`agent/message_metadata.py:27` beschreibt UID-Erhalt bei Kopien/Rewrites und
`:116` die gerichteten Merge-Zeugen. Auch Assistant-Folds existieren tatsächlich
(`agent/agent_runtime_helpers.py:549`); eine zusammengesetzte Row darf deshalb
nicht pauschal mit allen enthaltenen echten Antworten gleichgesetzt werden.

`tui_gateway/prompt_turn.py:882` wählt `final_assistant_row_id` strukturell und
prüft den finalen Body; `complete` bestätigt zusätzlich den gesamten Turn-Suffix.
Die finale Row-Adresse kann auch bei `complete=false` belegt sein. Der Handoff
verlangt korrekt zusätzlich den UID-/Scope-Zeugen und behauptet keine universelle
spätere Kreuzreferenz. `user_row_id` oder letzter Assistant allein genügt nicht.

`agent/turn_stop_gates.py:132` schreibt Verification-/Hook-/Kanban-Interims mit
eigenen Gründen; `turn_final_response.py:332` prüft Stop-Gates vor dem finalen
Write. `turn_finalizer.py:240` und `codex_runtime.py:662` bestätigen abweichende
Writer-/Recovery-Pfade. Die jetzt begrenzte Aussage „Neue Antwort“ ist tragfähig.

Die neue Projektion gehört vor die Ausgabe, mit Zugriff auf rohe Historyfelder
und interne Liveidentität. Aktuell verwirft `upstream-schemas.ts:32` den
Profile-Stempel, `normalize-history.ts:18` weitere Belegfelder, und der Hook in
`manager.ts:255` läuft nach Broadcast. Der Entwurf benennt diese nötige spätere
Koordination ausdrücklich. Vorhandene Strict-Schemas sind kein fertiger Belegpfad.
Opt-in muss je Socket gelten, auch bei zwei Clients desselben Principal-Managers;
Altclients erhalten keinerlei neue Felder. Kürzungsprüfung muss vor dem Verlust
der Längeninformation aus `normalize-values.ts:7` erfolgen. Beides passt zum Plan.

Die Handle-Limits, Owner-/Scope-/Sessionbindung, atomare Batch-Ablehnung und
Neustartentwertung sind ansonsten einfach implementierbar. Late Equality darf
nur dieselbe bewiesene Antwort bestätigen; gerichtete Merge-Kanten und später
gefundene absorbed UIDs erweitern alte Handles nicht. Keine unbeschränkte
transitive Read-Abdeckung. Mehr als 64 Bestandteile bleibt ausdrücklich ungeklärt.

Der Watcher (`tui_gateway/change_watcher.py:125,285,308`) bestätigt globale,
verlustbehaftete Invalidierungen ohne IDs. Baseline, Anchor, 64+64 Rows, zwei
Worker, Dirty-Limit und erneuter Summary-Durchgang passen als begrenzter Abgleich.
Die Grenze beschränkt angeforderte Rows; sie garantiert keine konstante interne
Core-DB-Arbeit, da `hermes_state_messages.py:1410` Lineages vor Pagination liest.
Das erfordert keine zusätzliche Pollschleife und ändert das Architektururteil nicht.

## Prüfgrenze

Nur dieser Bericht wurde geschrieben. Keine Produktänderung, Registrierung,
Dienste, echten Hermes-Turns, Browseraktionen, Git-Operationen oder Unteragenten.
Statische Quellprüfung und Ablaufgegenbeispiele, keine Laufzeitabnahme von Phase 4.
`pnpm typecheck` und `pnpm architecture:file-lines` erfolgreich. Der Bericht hat
153 physische Zeilen und erfüllt damit zusätzlich das engere 180-Zeilen-Limit.
