# Hermes V2: Organisations-Gate, Runde 2

Stand: 16.10.2026. Gezielter Read-only-Recheck von H1 und M1–M3 aus
`hermes-v2-organisation-review.md`. Geprüft: überarbeiteter Organisations-
Handoff, relevanter Inventarabschnitt und der tatsächliche Attention-Hook als
Schnittstellengrundlage. Kein erneuter Gesamt- oder Security-Audit.

## Urteil: PASS als Architekturgrundlage für Phase 4

Die vier Findings sind auf Spezifikationsebene geschlossen. Keine weiteren
konkreten High- oder Medium-Findings im beauftragten Recheck nachgewiesen.
Der Entwurf ist für die Phase-4-Implementierung entscheidungsfähig. Andere
Phasengates und das laufende separate Backend-/Security-Gate bleiben bestehen.
Diese Freigabe bestätigt keine bereits implementierte Organisationslogik.

## H1 geschlossen: Read hat eine Beobachtungsgrenze

Handoff Zeilen 17–30, 80–85 und 150–155; Inventar Zeilen 161–166 und 178–182.
Read bestätigt monoton den tatsächlich dargestellten Abschlusscursor, gebunden
an die angewendete Snapshot-/Eventgrenze. Weder HTTP-Empfangszeit noch aktueller
DB-Cursor dürfen zusätzliche Antworten bestätigen. Damit wird ein neuer, erst
nach Read zugestellter Abschluss nicht durch einen früheren Read verschluckt.

Der gemeinsame Faktendienst muss Identität und Cursor ohne Verlust atomar
zusammenführen; für automatische Ereignisse ist kein verwerfbares Browser-CAS
vorgesehen. Eventidentität trennt gleich datierte Ereignisse. Die spezifischen
Tests für beide Zustellreihenfolgen und dieselbe Millisekunde sind aufgenommen.

## M1 geschlossen: Wake hängt nicht mehr vom Read-Zustand ab

Handoff Zeilen 57–65 und 110–113; Inventar Zeilen 167–179.
Ein späterer relevanter Abschluss entwertet Snooze beziehungsweise Settle
dauerhaft. Read stellt die alte Organisation nicht wieder her. Ein danach neu
gesetzter Snooze/Settle bestätigt den aktuellen Attention-Cursor und wirkt erneut.
Bei unbelegter Ursprungszeit wird keine Uhrzeit erfunden; unentscheidbare späte
Ereignisse bleiben konservativ sichtbar. Felder können erhalten bleiben, sofern
der Resolver ausschließlich ihre effektive Gültigkeit verwendet.

## M2 geschlossen: Reorder schützt Liste und Zeilen

Handoff Zeilen 86–90 und 108–113.
Reorder prüft unter derselben Schreibtransaktion sowohl die erwartete
Pin-Listenrevision als auch vollständige aktuelle Mitgliedschaft und
Zeilenrevisionen. Fortlaufende ganzzahlige Ränge sind festgelegt. Pin, Unpin,
Reorder und deren Undo erhöhen die Listenrevision; Reorder-Undo prüft sie
ebenfalls. Damit wird die konkurrierend neu gepinnte oder entfernte ID erfasst.

## M3 geschlossen: gemeinsame Fakten, private Organisation

Handoff Zeilen 21–30 und 115–123; Inventar Zeilen 178–192.
Contentfreie Attention-Fakten werden pro gespeicherter Hermes-Session getrennt
von principalgebundenen Read-/Pin-/Snooze-Daten und Undo-Handles geführt.
Persistierte Assistant-Row-ID hat Vorrang; später bewiesene Aliaszuordnung
verbindet History und Live-Abschluss ohne Textvergleich. Mehrere Manager sind
keine getrennten Hermes-Datenbestände.

Gemeinsame Invalidierungen erreichen alle berechtigten betroffenen Manager,
einschließlich Summary-only/Snoozed. Begrenzte Reconciliation bei Änderungen,
Reconnect und Browserstart berücksichtigt auch Classic, Terminal und Flag-off.
Die Pflichtnachweise enthalten zwei Principals mit getrennten Organisations-
zuständen und einem gemeinsamen Abschluss. Private Metadaten werden nicht verteilt.

## Tatsächliche Schnittstelle und verbleibende Nachweise

`apps/server/src/hermes/v2/types.ts:18` liefert über `onAttention` Principal,
Stored-ID, Art, Eventschlüssel, nullable Ursprungszeit und nullable Upstream-
Cursor aus Epoche, Live-ID und Sequenz. `manager.ts:216` bevorzugt die
normalisierte persistierte Assistant-Row-ID. `manager.ts:247` erfindet keine
Abschlusszeit, sondern liefert aktuell `completedAt:null`. Damit muss die
Organisation den spezifizierten Cursor-/Identitätspfad tatsächlich verwenden.
Diese Felder wurden gelesen, der eingefrorene Backend-Code wurde nicht geändert.

Die konservative Undo-Regel ist jetzt explizit: Read/Completion können Undo
durch eine neue Revision ablehnen; der Konflikt wird angezeigt. Attention und
Read-Wasserzeichen werden beim Restore niemals zurückgesetzt. Dies schützt
insbesondere einen zwischenzeitlichen Wake und ist als einfache sichere Lösung
akzeptiert.

Phase 4 muss die im Handoff genannten Race-, Alias-/Replay-, Principal-,
Reconciliation- und Undo-Tests tatsächlich ausführen. Dieses Dokument prüft
deren Spezifikation und Schnittstellenverträglichkeit, keine Produktlaufzeit.
Keine Produktdateien, Services, Git-Operationen oder Unteragenten verwendet.
Einziges neues Schreibartefakt ist diese Gate-Datei.
