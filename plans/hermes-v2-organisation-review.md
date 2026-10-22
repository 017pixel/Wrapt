# Hermes V2: Review des Organisationsentwurfs

Stand: 16.10.2026. Reine Architekturprüfung von
`hermes-v2-organisation-handoff.md` gegen das verbindliche Inventar und den
Originalauftrag, insbesondere §§5.2–5.9 und 11.5. Keine Implementierung.

## Urteil: needs fixes vor der Phase-4-Implementierung

Ein High- und drei Medium-Findings. Die Grundaufteilung passt: Hermes besitzt
Sessiondaten, Wrapt nur Organisationsmetadaten. Requests und relevante
ungesehene Abschlüsse stehen vor Snooze, Settled und Pin. Die folgenden
Rennen und Übergänge sind im Handoff noch nicht vollständig abgesichert.

## H1: Read bestätigt noch nicht dargestellte Abschlüsse

**Ort:** Handoff Zeilen 20–27 und 63–64; Resolver Zeilen 35–37.
`last_read_at=now` verwendet den Empfangszeitpunkt der Aktion statt der
Aufmerksamkeitsgrenze des tatsächlich dargestellten Snapshots.

**Auslöser:** Snapshot mit Stand 100 wird sichtbar. Hermes beendet einen
weiteren Turn bei 110; dessen Event wird verzögert verarbeitet. Read trifft
bei 120 ein und setzt `last_read_at=120`. Erst danach wird der Abschluss mit
seinem korrekten ursprünglichen Zeitpunkt 110 eingetragen. Die Antwort wurde
nie gesehen, aber `110 > 120` ist false. Per-Row-CAS verhindert dies nicht,
weil der neue Abschluss beim erfolgreichen Read noch nicht eingetragen war.
Damit verletzt der Resolver die Needs-input-Regel für ungesehene Antworten.

**Korrektur:** Read an die tatsächlich vollständig dargestellte Snapshot-/
Eventgrenze binden, beispielsweise einen serverseitig nachvollziehbaren
Attention-Cursor. Nur diese beobachtete Grenze monoton bestätigen, niemals
die spätere HTTP-Empfangszeit. Spät eintreffende Events, Replay und dieselbe
Millisekunde müssen eine eindeutig geordnete, stabile Identität behalten.
Automatische Abschluss-/Fehlerwasserzeichen atomar monoton zusammenführen;
bei einem CAS-Konflikt darf ein fachliches Abschlussereignis nicht entfallen.

**Pflichttest:** Neuer ungesehener Abschluss zwischen Snapshot und Read,
sowohl vor als auch nach dem Read-Commit zugestellt. Er bleibt Needs input;
auch gleich datierte, unterschiedlich geordnete Ereignisse werden getrennt.

## M1: Ein Abschluss weckt Snoozed nur bis zum nächsten Read

**Ort:** Handoff Zeilen 36–39 und 57–64.
Die Prioritätsregel überstimmt einen Snooze nur, solange der Abschluss
ungesehen ist. Sie entfernt oder entwertet den alten Snooze nicht dauerhaft.

**Auslöser:** `snoozed_at=100`, `snoozed_until=1000`, neuer Abschluss bei 200.
Die Session erscheint korrekt in Needs input. Nach Read bei 300 verschwindet
die Aufmerksamkeit; Regel 3 steckt sie wieder bis 1000 in Snoozed. Das ist
kein dauerhafter Wake durch den neuen Abschluss, wie im Inventar verlangt.

**Korrektur:** Effektiven Snooze unabhängig von Read durch einen späteren
Abschluss entwerten oder dessen Wake atomar persistieren. Der ursprüngliche
Snooze-Aktionszeitpunkt kann als Bestätigungswasserzeichen erhalten bleiben.
Undo darf einen zwischenzeitlich erfolgten Wake nicht unbemerkt aufheben.

**Pflichttest:** Snooze → neuer Abschluss → Read bleibt wach. Ein erst danach
neu gesetzter Snooze greift dagegen wieder; alte/replizierte Abschlüsse wecken
ihn nicht. Wake durch Ablauf und Wake durch Abschluss getrennt prüfen.

## M2: Reorder-CAS schützt nicht vor Änderungen der Pin-Menge

**Ort:** Handoff Zeilen 14–15, 65–66 und 84–85.
Revisionen der übergebenen Zeilen schützen keine nicht übergebene neue Pin-ID.
Eine Prüfung der vollständigen aktuellen Pin-Menge ist nicht festgelegt.

**Auslöser:** Tab A liest die Pins `[a,b]`. Tab B pinnt `c`; die Revisionen von
`a` und `b` bleiben gleich. A sendet seine alte Reorder-Liste. Alle genannten
CAS-Bedingungen bestehen weiterhin. Die neue Platzierung von `c` kann damit
übergangen werden oder mit neu vergebenen Rängen kollidieren. Dasselbe Rennen
betrifft das Undo eines Reorders nach einem späteren Pin/Unpin.

**Korrektur:** Pro Principal eine Pin-Listenrevision verwenden, die bei
Pin/Unpin/Reorder und deren Undo steigt, oder innerhalb derselben Transaktion
exakte vollständige aktuelle Mitgliedschaft plus sämtliche Zeilenrevisionen
prüfen. Rangvergabe und Gleichstandsregel ebenfalls verbindlich festlegen.

**Pflichttest:** Reorder gegen gleichzeitiges neues Pin, Unpin und konkurrierendes
Reorder; stale Liste beziehungsweise stale Undo ergibt 409 ohne Teiländerung.

## M3: Gemeinsame Abschlüsse haben noch keinen Principal-übergreifenden Vertrag

**Ort:** Handoff Zeilen 12–27 und 88–90; Inventar Zeilen 76–82 und 183–187.
Read, Snooze und Pins sind privat, Hermes-Abschlüsse sind gemeinsame Fakten.
Der Entwurf speichert beide pro Owner, definiert aber weder deren zuverlässige
Verteilung noch eine gemeinsame stabile Identität/Zeitbasis des Abschlusses.

**Auslöser:** A und B organisieren dieselbe gespeicherte Hermes-Session. B hat
sie snoozed und nur als Summary geladen. A oder Classic beendet einen Turn.
Aktualisiert allein der beobachtende Principal-Manager seine Owner-Zeile und
invalidiert nur seine Clients, bleibt B ohne neues Abschlusswasserzeichen
snoozed. Getrennte Manager sind keine getrennten Hermes-Sessionbestände.

**Korrektur:** Autoritative Ereignisidentität und ursprünglichen Zeitpunkt
Principal-unabhängig festlegen. Gemeinsame Attention-Fakten entweder getrennt
von privaten Organisationsdaten halten oder für alle berechtigt betroffenen
Owner zuverlässig ableiten/aktualisieren. Reconnect/Restart und nicht live
abonnierte Summary-Zeilen einschließen. Private Read-/Pin-/Snooze-Werte und
Undo-Handles niemals an andere Principals verteilen. „Fremde IDs“ bei Reorder
meint fremde Metadaten/Handles, keine erfundene Hermes-Session-Eigentümerschaft.

**Pflichttest:** A und B, dieselbe Stored-ID, unterschiedliche Organisation;
Abschluss aus A beziehungsweise Classic erreicht beide Zustandsauflösungen,
während Read und Undo von A die Metadaten von B unverändert lassen.

## Undo/CAS und Evidenzgrenze

Der aktuell einheitliche Revisionsvergleich ist gegen Überschreiben sicher,
aber konservativ: Jedes revisionssteigernde Read oder Completion nach einer
Organisationsaktion lässt auch deren Undo scheitern. Das ist kein eigener
Sicherheitsfehler. Die UI muss den Konflikt behandeln; falls Undo über solche
Ereignisse hinweg gelten soll, eine Organisationsrevision getrennt von den
Aufmerksamkeitswasserzeichen vergleichen und nur betroffene Org-Felder ändern.
Read-/Completion-Werte dürfen bei Restore weiterhin niemals zurückgesetzt werden.

Die Befunde sind konkrete Ablaufspuren gegen die Spezifikation, keine Aussagen
über bereits implementierte Phase-4-Produktlogik. Keine Produktdateien, Services,
Git-Operationen oder Unteragenten. Einziges neues Artefakt ist dieser Bericht.
