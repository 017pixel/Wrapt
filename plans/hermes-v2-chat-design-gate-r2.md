# Hermes V2: Chat-Architekturgate, Runde 2

Stand: 16.10.2026. Gezielter Recheck des überarbeiteten
`hermes-v2-chat-handoff.md` gegen alle sechs Findings aus
`hermes-v2-chat-design-review.md`, den unveränderten öffentlichen Vertrag und
den dort geprüften Originalauftrag §§6.2–7/Phase 3. Originalreview unverändert.

## Urteil: PASS für die vorbereitende Chat-Architektur

H1, H2, H3, M1, M2 und M3 sind auf Spezifikationsebene geschlossen. Keine
konkreten verbleibenden High- oder Medium-Widersprüche im beauftragten Recheck.
Der fachliche Handoff ist für die spätere Umsetzung entscheidungsfähig.
Die Produktimplementierung bleibt bis zu den vorangehenden Phasengates gesperrt.
Dies ersetzt weder das separate Backend-/Security-Gate noch das tatsächliche
Phase-3-Gate mit implementiertem Chat und Laufzeitnachweisen.

## H1 geschlossen: Owner, Auswahl und Session-Leases sind getrennt

Handoff Zeilen 44–64, 86–92 und 141–156.
Der Hook erhält explizit `{ownerId, sessionId, onSelectSession}`. Auswahl und
Composer gehören zur Oberfläche, Chatdaten zur Stored-ID, Socket zum Tab.
Subscribe/Unsubscribe folgen der Consumerzahl pro Session und bleiben beim
StrictMode-Replay stabil. Panel-Auswahl nutzt seinen Layout-Pfad; geparkte
Routen übernehmen keine fremde URL-Auswahl.

Aktionen erfassen Session und Composer-Generation. Späte Resultate dürfen weder
fremde noch neu bearbeitete Drafts löschen. Nach Await wird vor einem weiteren
Schreibsend erneut die Owner-/Auswahlgeneration geprüft. Ein inzwischen
geschlossenes Panel sendet nach Create keinen verspäteten ersten Prompt.

## H2 geschlossen: Eventreihenfolge und Snapshotbarrieren sind verbindlich

Handoff Zeilen 96–117.
Deltabatches werden vor nachfolgenden sequenzierten Events geflusht. Kein
vorgezogener Cursor darf frühere Tokens verwerfen, keine Completion darf durch
einen verspäteten Batch ergänzt werden. Jeder autoritative Snapshot verwirft
überholte Batches, ersetzt laufenden Zustand und setzt den Frontier neu,
auch bei kleinerem Cursor in derselben Epoche.

Lokale Snapshot-/Subscribe- und Socketgenerationen entwerten alte Frames und
Resultate. Damit wird keine öffentliche Live-ID vorausgesetzt, die der
Snapshotvertrag nicht enthält. Stabile ältere History bleibt erhalten.

## H3 geschlossen: Unbekannter Sendeausgang wird nicht automatisch entwarnt

Handoff Zeilen 72–84 und 149–156.
Nach möglichem Send bleiben Timeout, Socketverlust und Dispose ohne eindeutige
Antwort `unknown`. Nur nachweisliche Blockierung vor Send ist `not_sent`.
Der Zustand bleibt Session/Owner zugeordnet; Enter oder gewöhnlicher Retry
heben ihn nicht still auf. Resync umfasst History und den aktuellen Snapshot
mit Inflight, Queue, Running und Requests. Fehlende History beziehungsweise
gleicher Text sind kein Annahmebeweis. Bewusstes erneutes Senden verlangt einen
Hinweis auf mögliche Doppelwirkung und eine ausdrückliche Aktion.

## M1 und M2 geschlossen: Tool-Status und Tool-Identität bleiben belegbar

Handoff Zeilen 119–135.
History-`complete` bedeutet beendet, nicht erfolgreich. Live-`error:null` bleibt
ebenfalls unbekannt; Outputtext und fehlende Fehlermeldung ersetzen keinen Beleg.
Die Trennung passt zum aktuellen Message- und Tool-Event-Vertrag.

Livekarten sind Session und Turn/Vorkommen zugeordnet. Wiederverwendete Tool-IDs
überschreiben keine älteren Karten. Historische Rows behalten ihre Row-ID;
`persistedTurn` beweist keine Tool-Row-Zuordnung. Ein Snapshot ohne Turn-ID führt
zu keiner geratenen History-/Live-Fusion. `complete:false` bleibt ausdrücklich
ohne Beweis eines vollständig gespeicherten Turns.

## M3 geschlossen: Rotation hat ein gemeinsames Budget und Reserven

Handoff Zeilen 76–84.
Spätestens bei 192 von 256 Operationen werden gewöhnliche Operationen
zurückgestellt, mit Reserve für Stop und Requestantworten. Der gemeinsame
Socket zählt alle Consumer und auch die späteren Resubscriptions. Rotation
wartet auf Mutationsabschluss oder begrenzten Timeout; möglicherweise gesendete
Mutationen bleiben ungewiss und werden nicht wiederholt. Alte Reads werden
abgebrochen und generationgebunden entwertet, gewünschte Leases lesend erneuert.

## Evidenzgrenze und spätere Pflichtnachweise

Die spezifischen Race- und Regressionsfälle sind im Handoff Zeilen 180–195
aufgenommen. Prüfung hier: Vertragsvergleich und Ablaufspuren, keine ausgeführten
Produkt- oder Browsertests. Default-off, sofortiges Dispose, kein Secret-/Chat-
Persistieren und keine Mutation-Replays bleiben erhalten. Keine Backend-Datei
oder andere Produktdatei geändert; keine Browser, Dienste, Commits oder
Unteragenten verwendet. Einziges neues Artefakt ist diese Gate-Datei.
