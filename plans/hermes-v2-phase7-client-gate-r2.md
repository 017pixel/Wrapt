# Hermes V2: unabhängiges Phase-7-Clientgate R2

Stand: 17.10.2026. **Urteil: needs fixes ausschließlich im nonvisuellen Client-R2-Scope.**
R1-M1/M2/L1/L2 sind in ihren belegten Repros geschlossen. Ein neues Medium-Finding
ist offen, mit zwei unabhängig ausgeführten roten Varianten. Kein High belegt.
Kein UI-, Browser-, Backend-, Gesamtphasen- oder Gesamtfeature-PASS. Keine Phase 8.

## Prüfgrenze und Integrität

Originalauftrag, feste Phase-7-Server-/Clientschnittstellen, Workhandoff,
Implementierungsbericht, vollständiges R1-Gate, alle fünf R1-Reprodateien samt
Fixture und Autorenantwort gegen die tatsächlichen Quellen geprüft. Frühere
Phase-3-R1/R2/R3-, Phase-4-R1/R8-, Phase-5-R1/R2- und Phase-6-R1/R2-Berichte
nachgelesen, insbesondere die vollständigen R1-Quellenberichte hinter den R2s.
Phase-2-Vorsend-/Protokollgrenzen und Formatwiederherstellung berücksichtigt.
AGENTS.md, sprachstil und config-infos angewandt. Keine weiteren Agents.
Produktpfade nachfolgend relativ zu apps/web/src/components/hermes/v2/.

Vor und nach Review stimmen **94/94 Dateien** mit fixes-code-freeze.json überein.
Eigener Vergleich gegen R1-frozen-after bestätigt genau sieben Produktänderungen:
chat-state/events/runtime sowie chat-work-context/actions/reads/state. Neu sind
ausschließlich chat-work-context-barriers.test.ts und chat-work-read-bounds.test.ts.
Alle alten Tests und Fixtures sind bytegleich, keine stillen Altassertionsänderungen.
Der historische 92er-Codefreeze entspricht weiterhin exakt R1-frozen-after.
**38/38 externe Code-/Config-/Fixturedateien** sowie **44 erfasste Altberichte,
Handoffs und Freezequellen** blieben während dieses Reviews unverändert.
Parallele UI-/CSS-/UItest-/E2E-/Doku-/Backendarbeit gehört nicht zum Clientfreeze.

Neue Repros und Logs ausschließlich unter
temp/hermes-v2/phase7-client-review-r2-20261017/. Die neue Fixture importiert die
unveränderte R1-TestSocket-Fixture. Alle Kontrollen verwenden echte ChatRuntime-,
GatewayClient-, AttachmentClient- und Actionpfade sowie öffentliche strikte
Zod-Frames. Keine ersetzten Produktguards oder Runtime-/Reducermethoden.

## Neues R2-M1, Medium: verworfener Abschluss wird durch altes Receipt running

Quellen: chat-work-state.ts:30, :59 und :65 bis :68;
Aufrufer chat-work-actions.ts:96, Aktivzähler chat-work.ts:35.
boundWork verwirft die älteste Taskzeile nach dem 100er-Limit. Der Terminalschutz
kennt ausschließlich die noch vorhandene Zeile. acceptedWorkTask interpretiert
eine inzwischen fehlende ID beim verspäteten Startreceipt erneut als running.

Ausführbarer gesunder Repro: completion-retention.test.ts:10, jeweils background
und btw. Eigenen nativen Start tatsächlich senden und Receipt halten. Ein gültiger
work.updated-Abschluss mit konkreter nativer ID trifft zuerst ein. Anschließend
100 weitere gültige Taskabschlüsse derselben Domäne beobachten, wodurch der erste
Abschluss lokal aus der begrenzten Sicht fällt. Nun das korrekte Startreceipt für
genau diese bereits abgeschlossene ID liefern. Kein Owner-, CWD-, Snapshot-,
Socket-, Abo- oder Epochenwechsel und kein widersprüchlicher Protokollframe.

Ist: Das Actionreceipt ist korrekt confirmed, aber der bereits fertige Task wird
als running neu angelegt und counts.tasks wird 1 statt 0 oder unbekannt. coverage.truncated=true
kennzeichnet zwar den Verlust, verhindert die falsche konkrete Statusbehauptung
aber nicht. Ein folgender Read mit gültigem STALE_REQUEST-Fehler behebt das nicht;
beides bleibt nach 30 Sekunden bestehen. Genau ein Startsend, kein Auto-Retry.
Der Hauptturn bleibt unverändert. Damit ist eine konkrete falsche Workprojektion
belegt, keine native Taskwiederaufnahme oder Mutation von Hermesdaten.

Gesundes Soll: Ein schon belegter Abschluss darf durch sein älteres Startreceipt
nicht wieder aktiv werden. Die begrenzte Liste darf ihn terminal behalten oder
weglassen, der Receipt bleibt ein bestätigter Startauftrag und kein aktueller
Aktivitätsbeweis. Bei nur 99 weiteren Abschlüssen bestehen beide Gegenkontrollen;
ein neuer Vollroster darf den tatsächlich nicht mehr beobachteten Task entfernen.

Fixrichtung: Abschluss-/Verlustwissen für noch ausstehende Startkorrelationen
unabhängig von der begrenzten Anzeige bewahren oder deren Aktivitätsprojektion
nach Belegverlust konservativ entwerten. Weiter nach kind plus task_id trennen,
Speicher begrenzen, Kontextbarrieren erhalten und nichts automatisch erneut senden.
Nur truncated zu setzen reicht für diese nachgewiesene Folge nicht aus.

## Ursprüngliche Findings nachgeprüft

R1-M1 geschlossen: chat-state.ts:18 und chat-events.ts:94 bis :99 führen echte
CWD-Beobachtungen monoton fort. chat-work-context.ts:26/:35 bindet Captures an
cwdRevision; chat-runtime.ts:306 löst den begrenzten aktuellen Folgeabgleich aus.
Alle neun unveränderten R1-Assertions bestehen. Eigene cwd-observations.test.ts
bestätigt alle sieben Actions bei unveränderten Infos sowie bei tatsächlichem
Send mit anschließendem A-null-A. Alte Writes werden unknown, Tail not_sent,
kein altes Resultat confirmed. Neuer bewusster Wunsch funktioniert. Queue prüft
zusätzlich das Microtaskfenster nach prepare vor Send. Gleiche Infos erhalten
bereits gesendete Reads und Tails; A-B-A verwirft alte Roster und liest danach neu.
Owner-/Dokument-/Flag-/Snapshot-/Abo-/Generation-/Socket-/Connection-/Epochengrenzen
bleiben in den wiederholten Originalkontrollen erhalten.

R1-M2 geschlossen: chat-work-actions.ts:22 bis :35 finalisiert den vorhandenen
ungültigen Queueeintrag unknown und prüft weiterhin seine konkrete lokale Identität.
Beide unveränderten R1-Fälle bestehen. Kein ewiges pending, submitting endet,
gleicher neuer bewusster Text sendet erneut, kein Auto-Retry. Owner-/Snapshot-/
Sichtbarkeitsentwertung setzt entfernte lokale Einträge nicht wieder ein.
queue-correlation.test.ts prüft echte mehrteilige Uploadantworten: nach CWD- oder
Snapshotbarriere ausschließlich konkrete Userrow 42 mit alter Datei korrelieren,
fremde Row 99 unverändert lassen, neuen Draft und neue Datei erhalten. queued/null
entfernt ausschließlich alte Optimistik. Workstate enthält weder Datei-ID noch Bytes.

R1-L1 geschlossen: chat-work-reads.ts:31 bis :36 setzt Reservation und gemeinsames
Abschlussversprechen vor Store- und Owneremit; :38 bis :43 gibt sie frei.
Originalfall grün. Eigene read-reservation.test.ts kombiniert Sessionlistener
und zwei reentrante Ownerlistener: ein gleichzeitig offener Read, trotz 80
Invalidierungen genau ein Folgeabgleich. Readfehler, CWD-A-B-A, Hidden, Flag-off
und Dispose geben die Reservation für einen neuen aktuellen Read frei.

R1-L2 geschlossen hinsichtlich des Kürzungshinweises: chat-work-state.ts:26
begrenzt Patch- und Receiptzeilen und setzt nur bei tatsächlichem Verlust truncated.
Eigene öffentliche Framekontrollen prüfen Subagent, Delegation samt taskIndex,
Background und Btw, jeweils exaktes Limit, gleiche ID und 101. Identität. Jeweils
102 reale Startreceipts prüfen auch ID-Wiederholung ohne falsche Kürzung.
Servertruncation bleibt erhalten, vor erstem Roster coverage und Counts unbekannt;
ein aktueller Vollroster darf einen neuen vollständigen Stand setzen.
Die darüber hinausgehende falsche Runningprojektion ist das neue R2-M1 oben.

## Ausgeführte Checks und erhaltene Grenzen

- Featuresuite mit Originalaufruf: **577/577 grün**, 43 Dateien, features.txt.
- Original-R1-Config unverändert: **157/157 grün**, r1.txt. Damit die zuvor
  13 roten gesunden Assertions geschlossen, keine Umkehr oder Abschwächung.
- Historische Originalconfigs unverändert: Phase 4 **172/172**, Phase 5 R1
  **30/30**, R2 **38/38**, Phase 6 R1 **93/93**, R2 **79/79**, zusammen **412**.
- Neue eigene Suite: **42 grün, 2 rot von 44**, fünf Dateien, own-final.txt,
  tatsächlicher **Exit 1**. Beide roten Fälle gehören zu R2-M1. Reproduktion:
  pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase7-client-review-r2-20261017/vitest.config.mjs --reporter=verbose.
- Scoped TypeScript aller 94 Dateien und eigener TS-Repros mit unveränderten
  Webcompileroptionen **grün**, scoped-types.txt. Scoped ESLint derselben Dateien
  plus eigener Config mit --max-warnings=0 und --no-ignore **grün**, lint.txt.
- Vollständiges **pnpm typecheck grün**, Extensioncontracts, Contracts, Server,
  Web und E2E, full-types.txt. Kein integrierter UI-Typblocker im eigenen Lauf.
- **pnpm architecture:file-lines grün**, architecture.txt; eigene Handdateien
  höchstens 77 Zeilen, dieser Bericht unter 200. Alle Freeze-Dateien unter 400.

Die unveränderten Originalfälle erhalten getrennte Identitäten, Delegationsindizes,
Cycles/Orphans, null/Omission, Completion ohne Start, native false/already_exited/
not_found/error/rejected sowie Stopvorrang bei 120 normalen Pendings. Queuekopf
kommt weiter ausschließlich aus Snapshot/Read; Tokens lesen keinen Roster, zwanzig
Summarys erzeugen keine Zusatzleases. Requestmutex, flüchtige Secretantworten,
Unknown-/Reconnectgrenzen, ModelRevision, requested versus observed/wire sowie
Attachmentreadiness und exakte UID-/Userrowbelege bleiben in den ausgeführten
Feature- und externen Suiten grün. Keine zusätzliche Backendfreigabe daraus.

Ein Explorationsfall erwartete vor dem Receipt eine bereits erneuerte gecachte
Ownerview nach Snapshot. Korrigiert wurde nur die eigene Vorprüfung auf den echten
lokalen Eintragsspeicher; die gesunde Endassertion bleibt leer. Ein erster Lintstart
scheiterte vor ESLint an Shell-Heredocsyntax; der korrigierte Lauf ist separat grün.
Diese Fehler zählen weder als Findings noch als bestandene Produktprüfungen.

Schlussbelege: frozen-before/after.json, external-before/after.json,
historical-before/after.json, r1-change-map.json und freeze-check.json im R2-Ordner.
Jeder eigene Fall disposet Runtime/Fakes und prüft null Timer und geschlossene
Sockets. Alle gestarteten Prüfprozesse sind beendet. Keine Produktfixes, alten
Test-/Berichtsedits, echte Hermes-CLI-/Core-, Dienst-/Browser-/Preview-/Slot-/Account-/Git- oder
Nutzerdatenaktionen. Einzige neue dauerhafte Datei ist dieser Bericht.
UIintegration, abschließende Gesamtchecks und Versionierung bleiben bei Root.

**Urteil: needs fixes ausschließlich im nonvisuellen Phase-7-Client-R2-Scope.**
