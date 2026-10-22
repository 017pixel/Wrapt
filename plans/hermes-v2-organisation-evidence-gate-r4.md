# Hermes V2: unabhängiges Beleg-Gate R4

Stand: 16.10.2026. Neue, gezielte Entwurfsprüfung des Organisations-Handoffs
mit 309 Zeilen. Originalauftrag sowie Originalreview, R2, Attention-Research,
Evidence-Addendum und R3 vollständig gelesen. Gegenstand dieser Runde ist
R3-M1 samt möglicher Regression durch den neuen Rückweg. Die unten genannten
Contracts, Adapter und Hermes-Quellen wurden gezielt selbst gelesen.

## Verdikt: PASS ausschließlich für den Entwurf

R3-M1 ist auf Spezifikationsebene geschlossen. Im beauftragten Recheck bleiben
keine konkreten High-/Medium-Findings offen. Der ergänzte Rückweg lässt sich
mit den vorgesehenen inhaltsfreien Fakten und derselben begrenzten Registry
umsetzen. Er benötigt weder eine Transcriptkopie noch neue Hermes-Receipts.
Das ist keine Implementierungs- oder Laufzeitfreigabe. Phase 2 bleibt unberührt;
Phase 3/4 werden durch diesen Bericht weder integriert noch als bestanden erklärt.

## R3-M1 geschlossen: erneuerbare Hinweise statt unauflösbarer Live-Attention

Handoff 134–157, 194–197 und 294–298 definieren Pfad, fachlichen Vertrag und
Pflichttests. GET `/organization/notices?sessionId=...` unter dem geplanten
V2-Organisationspräfix projiziert höchstens 100 Hinweise mit Cursor-Pagination.
Ein historischer Entscheidungsfehler erhält eine stabile Notice-ID, belegte
beziehungsweise beobachtete Zeit und den ausdrücklich generischen Hinweistext.
Sein frischer Handle belegt genau seine unveränderte Fehlerquelle.

Das ursprüngliche R3-Gegenbeispiel hat damit einen vollständigen Rückweg:
Fehler E ohne Row-Zeugen, B ohne ursprünglichen Handle, Ablauf/Eviction/Restart
und verlorenes Replay verhindern die erneute Projektion des gespeicherten
Fehlerfakts nicht. Erst B stellt den historischen Hinweis im aktiven Chat dar
und bestätigt mit seinem frischen Handle E. Die Fehler-Attention kann enden,
ohne dass verlorener Originaltext rekonstruiert oder als gelesen ausgegeben wird.

Für verlorene Antwortinhalte gilt ein anderer, ebenfalls konkreter Rückweg:
Die ausschließlich eventbasierte, belegbar nicht rekonstruierbare Quelle erhält
`unavailable-content` ohne Handle und eine eigene Abdeckungslücke. Ihr ACK bleibt
unverändert. Die nicht darstellbare Antwort hält neben dieser Lücke keine zweite
relevante Antwort-Attention fest. Eine bewusste Org-Aktion organisiert nur die
bekannte Lückenversion. Belegte Wiederverfügbarkeit erhöht die Abdeckungsrevision
und macht den weiterhin ungelesenen Inhalt erneut relevant.

## Gezielte Prüfung auf neue Ausweitungen

Der semantische Fehler-Namespace verhindert das kritische Alias-Gegenbeispiel:
Notice-ACK(E), danach Row-Zuordnung oder Merge mit Antwort A, liest A weiterhin
nicht. Handoff 142–144 verbietet die Gleichsetzung von Fehler- und Antwortquellen
ausdrücklich; 127–132 begrenzt zusätzliche Gleichheitsbeweise auf dieselbe
logische Antwort. Gerichtete Merge-Kanten und spät gefundene absorbed UIDs
erweitern keinen bereits ausgegebenen Handle. Es entsteht keine transitive
Bestätigung ungesehener Antworten.

Read bleibt Owner-/Scope-/Session-gebunden, mit fixierter Source-Menge und
atomarer Ablehnung ungültiger Batches. B benötigt einen eigenen frischen Handle;
ACKs von A werden nicht übernommen. Reines Laden der Sidebar oder Notice-Liste
bestätigt nichts. Offene Hermes-Requests bleiben unabhängig von Hinweis-Read,
Snooze und Settle in Needs input. Der Rückweg verlangt keine Request-Antwort.

Fehlende Rows im neuesten Ausschnitt beweisen ausdrücklich keine Eviction
(Handoff 149–157). Antwortverlust erfordert den beschriebenen Eventfall ohne
Row-Zeugen und fehlende Rekonstruierbarkeit nach Epochenwechsel oder nachgewiesener
Replay-Eviction. Ältere vorhandene History bleibt nachladbar. Das 64+64-Limit
des Abgleichs wird damit weder zum Löschbeweis noch zur pauschalen Read-Grenze.

Erneutes Scannen derselben Lücke erhöht ihre Revision nicht. Neue Fakten oder
belegte Wiederverfügbarkeit können dagegen eine spätere Org-Aktion dauerhaft
entwerten. Read und konservatives Undo stellen einen früheren Snooze/Settle
nicht wieder her. Die neue Lückenbehandlung widerspricht dem monotonen Wake nicht.

## Bestätigte Altfixes

Original-H1 und Addendum-H1 bleiben geschlossen: exakte eingefrorene Source-ACKs,
ACK vor Fact-Ingest und keine MAX-/Zeit-/Präfixbestätigung. Nur B dargestellt
liest A nicht; spät ingestierte andere Quellen bleiben ungelesen.

Addendum-H2 bleibt geschlossen: Live-Turnende, neue Antwort und Abdeckung sind
getrennt; keine universelle Offline-Fertig- oder `running=false`-Ableitung.
Addendum-M1 bleibt geschlossen: physisches `id`, bestätigter Scope/Branch,
UID-Zeugen und gerichtete absorbed-Abdeckung statt beliebiger Row-Gleichsetzung.

Original-M1 bleibt geschlossen: dauerhafter Wake unabhängig vom Read, erneutes
bewusstes Snooze/Settle möglich. Original-M2 bleibt geschlossen: vollständige
Pin-Menge, Listen- und Zeilenrevisionen sowie konservatives Undo ohne ACK-Restore.
Original-M3 bleibt geschlossen: gemeinsame Fakten und berechtigter Fanout bei
privaten ACKs, Pins, Snoozes und Undo-Handles.

## Tatsächlicher Quellabgleich und Prüfgrenze

Hermes-Pfade hier relativ zu `/home/bbecker/.hermes/hermes-agent/`:
`tui_gateway/session_auto_continue.py:563` emittiert terminale Fehler ohne
`persisted_turn`; `tui_gateway/prompt_turn.py:977` hält Fehler im Inflight.
`tui_gateway/event_replay.py:22,29,114,144` belegt Prozess-Epoche, begrenzten Ring
und Truncation-Nachweis. Diese Quellen tragen den R3-Auslöser weiterhin; der
neue Rückweg benötigt den verlorenen Payload gerade nicht erneut.

`hermes_cli/web_routers/sessions.py:723` und `hermes_state_messages.py:1392`
belegen nachladbare ältere History und Compression-Lineage mit Branch-Ausnahme.
`agent/message_metadata.py:27,116` trennt UID-Kopien und gerichtete Merge-Zeugen.
`tui_gateway/prompt_turn.py:882` bietet nur die tatsächlich belegte finale
Row-Zuordnung, keinen universellen dauerhaften Antwortinhalt.

In Wrapt zeigen `packages/contracts/src/hermes-v2-events.ts:8,23` sowie
`hermes-v2-sessions.ts:28,42` weiterhin keinen fertigen Notice-/Evidence-Pfad.
`apps/server/src/hermes/v2/session-service.ts:132,180` lädt History und Snapshot;
`manager.ts:264` sendet vor dem bisherigen Attention-Hook. Die geplante Ergänzung
muss deshalb weiterhin am Projektions-/Ausgabepfad erfolgen. Die getrennte
Request-Antwort läuft über `operations.ts:55` und `request-registry.ts:56`.
Ein Organisations-ACK benötigt weder Claim noch Hermes-Response.

Die erweiterten Pflichttests decken E ohne Row, B ohne alten Handle, TTL,
Eviction/Restart, Notice-ACK ohne Antwort-/Request-Ausweitung sowie verlorenen
Inhalt und erneuten Wake bei Wiederverfügbarkeit ab. Ihre Ausführung bleibt
Aufgabe der späteren Implementierung.

`pnpm typecheck` und `pnpm architecture:file-lines` erfolgreich. Statische
Quellprüfung und Ablaufprüfung, keine Runtime-Abnahme. Ausschließlich diese
Reportdatei geschrieben; frühere Berichte und Handoff unverändert. Keine
Produktänderungen, Realcalls, Dienste, Browser, Git-Operationen oder Subagents.
