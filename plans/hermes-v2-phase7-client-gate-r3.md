# Hermes V2: unabhängiges Phase-7-Clientgate R3

Stand: 17.10.2026. **Urteil: PASS ausschließlich im nonvisuellen Client-R3-Scope.**
R2-M1, zuvor Medium, ist geschlossen. R1-M1/M2/L1/L2 bleiben geschlossen.
Keine neuen bestätigten Findings und keine offenen konkreten Einwände in diesem
Scope. Kein Backend-, UI-, Browser-, Gesamtphasen- oder Gesamtfeature-PASS.
Keine Freigabe für Phase 8.

## Prüfgrenze und Integrität

Neuer unabhängiger Reviewlauf. Vollständigen Originalbrief, feste Phase-7-Server-/
Clientschnittstellen, Workhandoff, Implementierungsbericht, beide bisherigen
Clientgates und Autorenantworten gegen die tatsächlichen Quellen abgeglichen.
Frühere Phase-3-Gates, Phase-4-R1 bis R8, vollständige Phase-5-R1-/R2-Berichte samt
Fixantwort, Phase-6-R1/R2 und Formatwiederherstellung nachgelesen. Die früheren
Vorsend-/Unknown-/Protokollgrenzen aus Phase 2 berücksichtigt. AGENTS.md,
sprachstil und config-infos angewandt. Keine weiteren Agents.

Produktpfade unten relativ zu apps/web/src/components/hermes/v2/.
Eigene Belege ausschließlich unter
temp/hermes-v2/phase7-client-review-r3-20261017/.

SHA-256 vor und nach Review: **97/97** Dateien stimmen mit
temp/hermes-v2/phase7-client/fixes-r2-code-freeze.json überein.
Eigener Vergleich mit dem 94er-R2-Freeze bestätigt exakt vier geänderte alte
Produktdateien: chat-work-actions/reads/state.ts und chat-work.ts. Neu sind nur
chat-work-receipts.ts und die zwei angekündigten Regressionstestdateien.
Alle alten Tests/Fixtures sind bytegleich, keine alte Assertion geändert.
Belege: r2-change-map.json und frozen-before/after.json.

Zusätzlich **52/52 externe Test-/Fixture-/Configdateien** unverändert, darunter
die 38 historischen Dateien sowie sämtliche R1-/R2-Repros und deren Originalconfigs.
**48/48 historische Berichte, Handoffs und Freezequellen** unverändert.
Alte Freezes bleiben historische Belege. Parallele Root-UI/CSS/UItests/E2Es/Doku
und der separate Backendfix gehören nicht zum eingefrorenen Client-Scope.

## R2-M1, Medium: unabhängig geschlossen

Quellen: chat-work-actions.ts:89 reserviert den Marker vor client.request und
damit vor dem tatsächlichen Socket.send. chat-work-receipts.ts:18 bindet ihn
an den wirklichen Workcapture, :26 trennt Sitzungen, :45 trennt Taskarten und
akzeptiert ausschließlich konkrete completed-IDs. :32 erhält frühe Abschlüsse
unabhängig vom begrenzten Roster. chat-work-state.ts:65 projiziert dieses Wissen,
während chat-work-actions.ts:105 den bestätigten Startauftrag getrennt bestätigt.

Den unveränderten R2-Repro selbst wiederholt: **44/44 grün**, einschließlich
beider zuvor roten gesunden Varianten mit 100 weiteren Abschlüssen.
Neue eigene retention.test.ts prüft beide Taskarten jeweils mit Patch- und
gültigem vollständigem Readbeleg sowie 99/100/130 weiteren Abschlüssen.
Der früh abgeschlossene Task bleibt completed, counts.tasks bleibt 0,
das native Startreceipt confirmed und der Hauptturn weiter aktiv.
Auch nach 30 Sekunden und absichtlich fehlschlagendem Folgeabgleich kein Retry
und keine Wiederbelebung. Ein späterer aktueller Vollroster darf Zeilen entfernen.

Weitere eigene Gegenfälle: Completion und ACK synchron im wirklichen TestSocket.send,
schon vor dem Send sichtbarer Abschluss, gültiger Read mit anschließendem leeren
Vollersatz, mehrere offene Starts mit umgekehrten ACKs sowie gleiche native IDs
verschiedener Arten und Sitzungen. Keine ersetzten Runtime-/Guard-/Reducerpfade.
Der alte Medium-Trigger erzeugt keine falsche konkrete Aktivitätsbehauptung mehr.
Keine weitere Fixrichtung erforderlich.

## Evidenzbudget, negative Belege und Lebensdauer

chat-work-receipts.ts:20 begrenzt Marker auf 128, :47 begrenzt eindeutige IDs
je Marker ebenfalls auf 128. Keine unbeschränkte Terminalhistorie, keine neuen
Timer, kein Ergebnistext im Marker. Die bestehenden Rostertexte bleiben begrenzt.
Eigene evidence.test.ts prüft 127/128/129 IDs, 128 Marker samt abgewiesenem 129.,
Wiederverwendung eines freigegebenen Platzes und 500 Duplikate mit nur einem IDplatz.
Frühe gespeicherte Belege überleben Overflow; spätere unbekannte IDs bleiben unknown.

Wenn die eigene Completion erst nach Budgeterschöpfung eintrifft und später aus
dem sichtbaren Roster fällt, entsteht beim ACK keine geratene running-Zeile.
Alle Counts bleiben null, auch nach einem gescheiterten Read und 30 Sekunden.
Erst ein aktueller gültiger Vollread bestätigt wieder Counts. Das tatsächliche
Startreceipt bleibt unabhängig davon confirmed.

Ältere Workrevisionen werden vor der Belegübernahme verworfen:
chat-work.ts:48 und chat-work-reads.ts:78. Eigene Gegenfälle prüfen stale Patch,
stale Vollread, fehlende Zeile, bloßes running, Statusomission, text=null und
leeren Vollroster. Keiner erzeugt einen positiven Abschlussmarker. Gleiche IDs
von Subagents/Delegationen sind keine Taskabschlüsse. Eine spätere Textomission
oder text=null löscht dagegen den bereits konkreten Taskabschluss nicht.
Der öffentliche Taskvertrag erlaubt status=null ausdrücklich nicht.

lifecycle.test.ts prüft für beide Arten CWD-A-B-A, neue Snapshotgeneration,
Owner-A-B-A, Hidden-/Dokument-/Activewechsel, neue Abogeneration, Connection-ID,
Epoche, Socket, Flag-off und Dispose. Alte ACKs erzeugen keinen bestätigten neuen
Startzustand; Marker und gehaltene IDmengen sind danach leer.
chat-work-actions.ts:116 gibt Marker in finally frei; invalidate/prune/dispose
in chat-work-receipts.ts:37 beseitigen auch Daten gehaltener Markerreferenzen.

Jeweils 130 tatsächliche Fehlerzyklen für not_sent, unknown, Timeout,
Op-Protokollwiderspruch und Socket.send-Throw, für beide Arten: kein erschöpftes
Markerbudget, keine automatische Wiederholung. Ein neuer bewusster Klick funktioniert.
Je 130 frühe Ablehnungen bei Readonly, ungültigem Text, Hidden, Sendbackpressure
und 120 belegten normalen Pendingplätzen lassen ebenfalls keinen Marker zurück.
Der Stopweg bleibt bei den 120 Pendings erreichbar.

## Erhaltene frühere Grenzen

Alle **157 unveränderten R1-Fälle** bestehen, einschließlich der zuvor 13 roten
gesunden Assertions: monotone CWD-Barriere für sieben Actions/Reads/Tail,
Queueunknown beendet pending und erlaubt neuen bewussten Klick, Reservation vor
reentranten Store-/Owneremits sowie ehrliche Kürzung aller begrenzten Domänen.
Gezielte Userrow-42-/Attachmentkorrelation nach Kontextverlust erhält fremde
Rows, neue Drafts und neue Dateien; alte Snapshots autorisieren keine alte Arbeit.

R2 und historische Kontrollen erhalten getrennte Identitäten/Delegationsindizes,
Orphans/Zyklen, null/Omission, Completion ohne Start und Hauptturnhaltung.
Native false/already_exited/not_found/error/rejected bleiben exakte Resultate.
Queuekopf stammt ausschließlich aus Snapshot/work.read. Token erzeugen weder
Roster-/Sidebarreads noch zusätzliche Leases. Requestmutex, flüchtige Secretwerte,
Unknown ohne Replay, Reconnect, ModelRevision versus Beobachtungsrevision,
requested/observed/wire sowie Datei-/UID-/Readinessgrenzen bleiben grün.

## Tatsächlich ausgeführte Checks

- Featuresuite mit unveränderter Webconfig und ursprünglicher Dateiauswahl:
  **602/602**, 45 Dateien, einschließlich 577 alter und 25 neuer Autorenfälle.
- Unveränderte R2-Originalconfig: **44/44**; R1-Originalconfig: **157/157**.
- Historische Originalconfigs: Phase 4 **172/172**, Phase 5 R1 **30/30**,
  R2 **38/38**, Phase 6 R1 **93/93**, R2 **79/79**, zusammen **412/412**.
- Neue eigene finale Suite: **89/89**, drei Dateien, tatsächlicher **Exit 0**,
  own-final.txt. Aufruf: pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase7-client-review-r3-20261017/vitest.config.mjs --reporter=verbose.
- Scoped TypeScript aller 97 Dateien plus eigener TS-Fixture/Repros mit unveränderten
  Webcompileroptionen **grün**, scoped-types-final.txt. Scope-ESLint einschließlich
  eigener Config, --no-ignore und --max-warnings=0 **grün**, lint-final.txt.
- Vollständiges **pnpm typecheck grün**, Extensioncontracts/Contracts/Server/Web/E2E,
  full-types.txt. **pnpm architecture:file-lines grün**, auch nach Berichtanlage.

Alle final gewerteten Testläufe enden mit Exit 0; kein Exit 1 wird als grün gezählt.
Originalaufrufe/Exitcodes stehen in original-results.json, eigene finale Checks in
final-check-results.json. Der erste eigene Scoped-Typlauf beanstandete einen
unbenutzten Import und die fehlende explizite Arraytypisierung meiner neuen Fixture.
Nur diese eigene Testdatei korrigiert; abschließende Typ-/Lint-/Testläufe sind grün.
Die ersten Fehlerprotokolle bleiben erhalten und sind keine Produktfindings.

## Schlussfreeze, Cleanup und verbleibende Grenze

Nach Berichtanlage 97 eingefrorene Dateien, 52 externe Dateien und 48 historische
Quellen erneut SHA-256-identisch geprüft; freeze-check.json hält die Mengen fest.
Eigene Handdateien höchstens 104 Zeilen, dieser Bericht unter 200; kein Produktfix.
Jeder eigene Fall disposet Runtime und Fakes und prüft geschlossene Sockets sowie
null Timer. Eigene Store-/Ownerlistener werden entfernt; alle Prüfprozesse beendet.

Keine echten Core-/CLI-/HTTP-, Dienst-, Browser-, Preview-, Slot-, Account-, Git-
oder Nutzerdatenaktionen. Keine UI-/Backend-/Contract-/Root-E2E-/Altbericht-/
Fremdteständerung. Einzige neue dauerhafte Datei ist dieser Bericht.
Partielle Reconnectabdeckung, next-only Queue, nicht garantiert steuerbare
Lineage-Kinder und fehlender StopTree bleiben dokumentierte Grenzen.
UI-/Backendabnahme, reale Laufzeitbelege, Integration und Versionierung bleiben bei Root.

**Urteil: PASS ausschließlich im nonvisuellen Phase-7-Client-R3-Scope.**
