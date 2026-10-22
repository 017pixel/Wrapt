# Hermes V2: Attention-Reconciliation außerhalb des Livepfads

Stand 16.10.2026, installierter Core `07908be267f54f498230b3aae0f27c3f27d8c973`.
Nur Quellen gelesen. Keine Requests, Datenbankzugriffe oder Produktänderungen.
Grundlage: `hermes-v2-organisation-handoff.md`; Phase-4-Code bleibt hinter Phase 3.

## Ergebnis und belegte Daten

REST ermöglicht begrenzte Erkennung neuer persistierter Antworten. Ein universeller
Beweis für einen abgeschlossenen Agent-Turn fehlt dort. Deshalb müssen ungelesene
Antwort und bestätigter Turnabschluss getrennte Tatsachen bleiben. Ohne diese
Unterscheidung ist vollständige, falsch-positive-freie Offline-Reconciliation mit
dem installierten Vertrag nicht möglich. Ein neuer Zeitstempel löst das nicht.

Alle folgenden Quellpfade liegen unter `/home/bbecker/.hermes/hermes-agent/`.

| Quelle | Tatsächliche Felder und Grenzen |
| --- | --- |
| WS `session.list` | `id,title,preview,started_at,message_count,source,_lineage_root_id`; exakte Titelabfrage zusätzlich `resolved_id/live_message_count`. Keine finale Row-ID, Turn-ID oder Abschlusszeit. Normalpfad ohne Offset. `tui_gateway/methods_session.py:118,522,549`. |
| REST `/api/sessions?limit=100&offset=…&order=recent` | Sessionfelder plus `last_active`, `is_active`, `unread`, `profile`, `total` und Compression-Provenienz `_lineage_root_id/_lineage_ids/continuation_kind`; keine finale Nachrichten-ID. `is_active` heißt nur Aktivität innerhalb 300 s bei fehlendem `ended_at`. `hermes_cli/web_routers/sessions.py:132,178`. |
| REST `/api/sessions/{id}/messages?limit=64&offset=0&order=latest&inline_images=false` | `session_id,profile,messages,pagination{limit,offset,order,returned}`; Limit maximal 500, Ausgabe chronologisch innerhalb der neuesten Seite. Keine `total`/`has_more`/vorherige Turn-ID. Compression-Ancestors werden einbezogen, `include_compacted` ist standardmäßig false. `web_routers/sessions.py:723`. |
| Einzelne REST-Nachricht | Physisches `id`, `session_id,role,content,tool_calls,tool_call_id,tool_name,timestamp,finish_reason,active,compacted,display_kind,display_metadata,message_uid,absorbed_message_uids` und optionale Providerfelder. `row_id/_row_id` wird hier nicht regulär erzeugt. `hermes_state_messages.py:1319,1392`; Schema `hermes_state_common.py:449`. |
| Live `persisted_turn` | `row_ids,user_row_id,final_assistant_row_id,complete`; finale ID nur bei erfolgreich ausgewählter terminaler Assistant-Row ohne Toolcalls und bestätigter Persistenz. `tui_gateway/prompt_turn.py:882`; Vertrag `contracts/events.py:175`. |

REST-Displayprojektion erhält IDs, Toolcalls und Finish-Reason. Sie ergänzt
gegebenenfalls `display_content/display_commentary/display_reasoning`; Bilder
werden bei `inline_images=false` zu Platzhaltern. Versteckte Scaffold-Rows und
Compaction-Markierungen sind keine Antworten. Quelle: `web_routers/sessions.py:653`.
`parent_session_id` und `_lineage_ids` belegen Sessionkanten, keine Turnkanten.

## Identität und Abschlussmerkmale

`messages.id` ist eine AUTOINCREMENT-Adresse innerhalb eines Profile-Stores.
Compaction/Rotation können denselben logischen Inhalt unter neuer physischer ID
tragen. Ein bloß höheres `MAX(id)` ist deshalb kein neuer Abschluss.
`message_uid` wird einmal vergeben und bleibt über Compaction, Rotation und
Rewrites erhalten; `absorbed_message_uids` enthält explizite Merge-Zeugen.
Das ist der belastbare Aliasnachweis, keine eigene Text-/Zeit-Heuristik.
Quellen: `agent/message_metadata.py:25`; `hermes_state_identity.py:77`;
`hermes_state_common.py:648`; Displayrepräsentanten `hermes_state_messages.py:1205`.
Merge-Zeugen sind keine Turn-End-Marker; insbesondere User-Merges nicht auf
Assistant-Abschlüsse übertragen. Alte Kopien können logische Identität vermissen.

`role=assistant && !tool_calls` genügt nicht: Verification-Interims werden
persistiert, bevor weitergearbeitet wird. Bekannte Nichtfinal-Gründe sind unter
anderem `incomplete`, `length`, `tool_calls`, `verification_required`,
`verify_hook_continue`, `kanban_terminal_required`; auch Commentary/Hidden/Summary
und Fehlertexte dürfen nicht als erfolgreicher Abschluss aufgewertet werden.
Quellen: `agent/turn_stop_gates.py:94–164`; `turn_final_response.py:180–242`.
Der normale Textpfad schreibt seine finale Row nach den Stop-Gates und vor dem
Loop-Ende (`turn_final_response.py:283–380`): `stop` ohne Toolcalls ist dort ein
starker terminaler Antwortbeleg. Als generisches REST-Feld ist es trotzdem kein
universelles Turn-Receipt für alle Writer/Imports/Provider.

Gegenrichtung: echte Recovery-Abschlüsse können eine Assistant-Row ganz ohne
`finish_reason` schreiben (`agent/turn_finalizer.py:240–280`). Codex-App-Server
persistiert projizierte Nachrichten separat (`agent/codex_runtime.py:662`).
`session_lifecycle_statuses` ist ausdrücklich permissiv: sogar unbekannte Formen
und Verification-Interims ohne Toolcalls werden `complete`. Nicht verwenden.
Quelle: `hermes_state_sessions.py:247,1464`. `session.active_list` kennt nur
Runtimes dieses Dashboard-Prozesses, keine fremden CLI-Prozesse (`methods_session.py:1152`).

## Einfachster ehrlicher Ablauf für Phase 4

1. Ein Core-/Profile-weiter Faktendienst verarbeitet Livebelege und Reconciliation
   unter derselben SQLite-Transaktion; private Read-/Organisationswerte bleiben getrennt.
   Persistiert werden nur Belegidentitäten, Cursor, Baseline/Abdeckung und Aliasdaten.
   Keine Inhalte, Secretantworten oder eigene Nachrichtenhistorie speichern.
2. Beim ersten bekannten Sessionzustand neueste 64 Rows nur als Baseline aufnehmen:
   letzter logischer Anchor `(message_uid, rowId, canonicalSessionId)` und eindeutige
   bereits bekannte Identitäten. Alte History wird damit niemals als neue Antwort
   veröffentlicht. Vorhandene echte Livefakten bleiben erhalten; Baseline ist kein Read.
3. Bei Start, Reconnect oder vorhandener Summary-Invalidierung geänderte Summaries
   und relevante bekannte Organisations-IDs abgleichen. Neue Seite mit 64 Rows lesen;
   nur bei fehlendem Anchor maximal eine zweite Seite, insgesamt höchstens 128 Rows.
   Query-Limits, Profile und exakte Session-/Lineagezuordnung serverseitig validieren.
4. Ist der bekannte Anchor im bestätigten logischen Verlauf enthalten, nur danach
   liegende neue logische Antworten prüfen. Leere/reasoning-only sowie
   Toolcalling-/Interim-/Scaffold-/Summary-/Commentary-Rows
   ausschließen. Bekannte UIDs beziehungsweise explizite Alias-IDs erzeugen keinen
   neuen Fakt. Ein neuer `stop`-Antwortbeleg darf als „Neue Antwort“ Attention auslösen;
   Agent-Fertig bleibt ohne Receipt unbekannt. Fehlender Finish-Reason bleibt unbestätigt.
5. Fehlen Anchor, Identität oder eindeutige Herkunft, Abdeckung als offen markieren.
   Keine aktuelle Zeit einsetzen, keinen maxRowId-Sprung als Completion deuten und
   keinen unvollständigen Ausschnitt als vollständigen Turn bestätigen. Neues
   ungeklärtes Material darf sichtbar „Abgleich unvollständig“ bleiben. Keine
   automatische Nachlade-Schleife bis zum Transcriptanfang.
6. Live-Cursor auf Row-Fakt nur mit explizitem `persisted_turn.final_assistant_row_id`
   aliasieren. Row-Kopien zusätzlich über identische `message_uid` verbinden.
   Ein reiner `(epoch,liveId,seq)`-Fakt ohne Row-Zeuge kann später nicht automatisch
   der „letzten Assistant-Row“ zugeordnet werden. Auch `user_row_id` allein beweist
   keinen konkreten Abschluss. Mehrdeutige Überschneidung offen halten und keine
   zweite bestätigte Completion erfinden. Der aktuelle Hook enthält keine universelle
   spätere Turn-/Row-Kreuzreferenz; solche Werte liefert auch die History nicht.
7. Read bestätigt ausschließlich den tatsächlich dargestellten Fakten-Cursor.
   Summary, Baseline und Reconciliation dürfen keine privaten Read-Werte vorschieben.
   `timestamp` bedeutet Row-Erstellung, nicht garantiert ursprünglicher Turnabschluss;
   für `completedAt` ohne Receipt-Zeit weiter null verwenden.

Für strikte vollständige Completion-only-Abnahme fehlt eine Hermes-seitige durable
Turn-Receipt-Projektion `(store,lineage,turnId,outcome,finalRowId,message_uid)` für alle
Writer. Sie kann nicht aus REST-Summaries rekonstruiert werden. Keine solche
Upstream-Änderung oder direkte DB-Anbindung ist durch diesen Bericht implementiert.

## Auslöser, Lastgrenze und Pflichtprüfungen

Hermes' vorhandener Watcher prüft Sessionsignaturen alle 0,5 s und bündelt globale
`sessions.changed` auf mindestens 2 s. Er sieht auch CLI/Gateway/Terminal-Schreiber
über dieselbe state.db; Payload ist `{}`, ohne betroffene IDs. Sessionzähler bewegen
die Signatur, reine Aktivitäts-Heartbeats nicht. Erste Signatur wird still als
Baseline gesetzt. Ohne WS-Peers werden Events verworfen, nicht dauerhaft replayt.
Quellen: `tui_gateway/change_watcher.py:125–205,284–355`; `server.py:746`;
Watcherstart bei WS-ready `ws.py:374`. Deshalb beim Wiederöffnen ausdrücklich abgleichen.
In-place Änderungen ohne Signaturänderung können ein Event verpassen.

Keine zweite Pollschleife: am vorhandenen Start-/Summary-/Reconnectpfad mitlaufen,
global pro Core single-flight bündeln, doppelte Principalsignale zusammenführen.
Zwei History-Worker, begrenzte Dirty-ID-Warteschlange; Summary-/Metadatenmengen
seitenweise verarbeiten. Sichtbare und organisierte Sessions priorisieren,
Restabdeckung explizit nachführen. Keine Resumes, vollständigen Transkripte oder
zusätzlichen Runtime-Sockets für reine Attention-Lesungen.

Tests: Erstbaseline historisch ohne Attention; normaler externer Antwort-Row nach
Anchor bei Flag-off; CLI ohne Dashboard-Runtime; Toolcalls/Verification/Commentary
ausgeschlossen; echte Null-Finish-Recovery bleibt unbekannt; Compaction mit neuer
Row-ID/gleicher UID; Receipt/Live-Replay/History genau ein Fakt; cursor-only bleibt
unaliased; zwei Abschlüsse gleicher Millisekunde; Anchor fehlt nach >128 Rows;
Store-Restore/UID-Konflikt; Root/Tip versus Branch; Snapshot → Completion → Read;
zwei Principals mit privatem Read; Eventburst single-flight und Workerlimit 2;
offline verlorenes globales Event; reine Summary-/Baseline-Lesung bestätigt nichts.
