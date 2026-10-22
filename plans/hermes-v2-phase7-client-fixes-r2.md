# Phase 7 Client: Antwort auf R2-M1

Stand 17.10.2026. Ausschließlich das freigegebene R2-M1 korrigiert und eigener
Code-/Testscope erneut eingefroren. Kein unabhängiges R3-/UI-/Backend-/Browser-/
Gesamt-PASS und keine Phase 8. R1-M1/M2/L1/L2 bleiben geschlossen.

## Ursache und Korrektur

Ein früher konkreter Taskabschluss fiel nach hundert weiteren Zeilen aus dem
sichtbaren Roster. Das spätere Startreceipt kannte nur diese begrenzte Anzeige
und legte die fehlende ID fälschlich erneut als running an.

Das neue kleine `chat-work-receipts.ts` hält Abschlusskennungen ausschließlich
für tatsächlich offene Startkorrelationen. Der Marker existiert vor dem nativen
Socket-Send, auch vor synchron dort eintreffenden Completions. Er bindet denselben
Workcapture und dieselbe Sitzung und unterscheidet background und btw. Konkrete
Abschlüsse aus akzeptierten work.updated-Patches, gültigen Vollreads und bereits
sichtbaren Zeilen bleiben unabhängig vom sichtbaren Hundertzeilenlimit erhalten.
Vom Reducer verworfene ältere Workrevisionen werden nicht als neue Markerbelege
verwendet. Es werden nur IDs gespeichert, keine Ergebnis-/Anzeigetexte.

`chat-work-actions.ts` fragt diesen Marker beim gültigen eigenen Startreceipt ab.
`chat-work-state.ts` übernimmt einen gesicherten Abschluss als completed, auch
wenn die Zeile inzwischen fehlt; verlorener Ergebnistext darf null bleiben.
Der echte Startauftrag bleibt confirmed. Er ist kein neuer aktueller Runningbeleg.
Ein späterer vollständiger Roster darf die nicht mehr beobachtete Zeile entfernen.

Markerzahl und eindeutige Abschluss-IDs je Marker sind jeweils durch das bestehende
chatPolicy.maxPending begrenzt, derzeit 128. Wiederholungen derselben ID kosten
keinen zusätzlichen Platz. Bei Überlauf werden früh gespeicherte Belege erhalten.
Ist die konkrete Receipt-ID danach nicht mehr entscheidbar, entsteht keine
geratene laufende Taskzeile. Counts bleiben bis zu einem aktuellen gültigen
Workread unbekannt. Der native bestätigte Receipt bleibt davon getrennt.

finally gibt den Marker auch bei not_sent, Timeout, Unknown und Protokollfehlern
frei. Owner-/Dokument-/Snapshot-/CWD-/Socket-/Abo-/Epochengrenzen bleiben erhalten;
Kontextentwertung und Dispose entfernen aktive Marker und ihre IDmengen.
Verschiedene offene Starts, Taskarten und Sitzungen bleiben getrennt. Es gibt
keine dauerhafte Abschlussdatenbank, keine neuen Timer und keinen Mutationsretry.

## Regressionen

R2-Gate und sein konkreter Repro vollständig gelesen, Backend-Fixbericht M1 als
fachlichen Vergleich geprüft. Den unveränderten R2-Lauf vor Fix reproduziert:
**42 grün, zwei rot von 44**. Danach unverändert **44/44 grün**, einschließlich
beider gesunden Sollfälle mit hundert weiteren Abschlüssen.

Zwei neue dauerhafte Testdateien, insgesamt **25 neue Fälle**:

- chat-work-completion-retention.test.ts prüft beide Taskarten mit 99/100/130
  weiteren Completions, spätere eigene Completion nach erschöpftem Evidenzbudget,
  konservative Counts und bewussten Vollread, synchronen Abschluss im tatsächlichen
  Send, mehrere offene Starts mit umgekehrten ACKs, gleiche IDs verschiedener
  Taskarten/Sitzungen, gültige Vollrosterbelege, stale Workrevisionen und CWD-A→B→A.
  Je 130 echte Fehler-/Timeoutzyklen prüfen Markerfreigabe ohne automatischen Retry.
- chat-work-receipts.test.ts prüft Marker-/IDobergrenzen, Duplikate, bewahrte frühe
  Belege, Owner-/Sitzungs-/Arttrennung sowie Datenfreigabe auch über gehaltene
  Markerreferenzen. Die Kontextguards bleiben die tatsächlichen Produktguards.

## Tatsächlich ausgeführte Checks

| Prüfung | Ergebnis |
| --- | --- |
| Featuresuite, 45 Dateien | **602/602**, bisherige 577 unverändert |
| Unveränderte unabhängige R2-Suite | **44/44**, bisherige 42 grüne erhalten |
| Unveränderte unabhängige R1-Suite | **157/157** |
| Historische Phase 4 | **172/172** |
| Historische Phase 5 R1/R2 | **30/30**, **38/38** |
| Historische Phase 6 R1/R2 | **93/93**, **79/79** |
| pnpm typecheck vollständig, einschließlich E2E | grün |
| Frischer Web-Typecheck nach letzter enger Revisionskorrektur | grün |
| Scoped ESLint sämtlicher chat-/gateway-Module, Tests und Chathook | grün |
| pnpm architecture:file-lines | grün |

Die ursprünglichen Vitestconfigs und sämtliche fremden Assertions blieben
unverändert. Prüfprotokolle liegen nur unter `temp/hermes-v2/phase7-client/`,
dieser Fixlauf verwendet r2- als Präfix. Die neuen Tests verwenden synthetische
Frames und tatsächliche Runtime-/Gateway-/Actionpfade, ohne ersetzte Guards.

## Scope und Freeze

Vier bestehende Produktdateien geändert: chat-work-actions/reads/state und
chat-work.ts. Neu sind nur das Receiptmodul und die beiden Regressionstestdateien.
Alle bisherigen eigenen Tests/Fixtures sowie fremde Repros sind unverändert.
Der Abgleich der 38 historischen externen Code-/Config-/Fixturedateien ist exakt.
Keine API-/UI-/CSS-/Server-/Contracts-/Organisations-/Root-E2E-Coedits.

Neuer SHA-256-Codefreeze mit **97 Dateien**:
`temp/hermes-v2/phase7-client/fixes-r2-code-freeze.json`.
Die früheren Freezes und Berichte bleiben als historische Belege unangetastet.
Alle eigenen Dateien liegen unter 400 Zeilen, keine breite Formatierung.
Teilabdeckung bei Reconnect und der nur nächste Queuekopf bleiben unverändert.

Keine weiteren Agents, echten Core-/CLI-/HTTP-/Nutzerdaten-, Browser-, Dienst-,
Git-, Preview- oder Slotaktionen. Fakes/Runtime werden beendet; Root übernimmt
R3-Gate, integrierte UI-/Browserchecks und Versionierung. Nach Übergabe Stop.
