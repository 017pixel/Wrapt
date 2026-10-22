# Hermes V2 Phase 8: Backendfixes nach R1

Stand: 17.10.2026. Die vier Befunde aus `hermes-v2-phase8-backend-gate.md`
und die anschließend von Root belegten H1-Aufrufer sowie Root-H2 sind umgesetzt.
Alle unten genannten lokalen Prüfungen sind abgeschlossen. Der Produktcode ist
für das unabhängige R2 eingefroren. Dies ist kein unabhängiges Gateurteil.

## H1: Originalklassifikation vor dynamischer Maskierung

Sensible JSONschlüssel werden am unveränderten Rohtext erkannt, einschließlich
escaped Keys, verschachtelter Werte, Arrays und unvollständiger Dateipräfixe.
Die zugehörigen ganzen Wertintervalle werden mit bekannten Secret-Volltreffern
und Langwertpräfixen vereinigt. Erst danach entstehen Masken und Begrenzungen.
Bekannte kurze Werte können damit `credentials` oder `password` verändern,
ohne den Schutz des ursprünglich zugehörigen fremden Werts zu verlieren.

Auch statische Plaintext-, Bearer-/Basic-, URLparameter- und Tokenregeln werden
vorher klassifiziert. Ihre Matcher liegen gemeinsam in `hermes/redaction.ts`;
`redactText`, `normalize-values.text` und die Rohintervallprüfung verwenden
dieselbe Quelle. Die bisherigen Matcher-/Ersetzungsregeln bleiben erhalten.

Der gemeinsame V2-Pfad `protectedText` schützt Ressourcen und `jsonText`.
Bei Toolinput/-output, History und Replay wird vor einer dynamischen
Keymaskierung die originale Struktur geschützt. Erst anschließend werden auch
verschachtelte JSONstring-Echos behandelt. Eine Maske über Strukturgrenzen darf
konservativ den betroffenen JSONdisplaytext unterdrücken; auch dieser Rückfall
hält das übergebene Zeichenlimit ein. Eingaben und Cacheobjekte bleiben erhalten.

Belege: unveränderte Gate-Credentialgruppen **12/12**, davon die zehn bisherigen
roten gesunden Sollfälle jetzt grün. Roots Plaintext-Repro **6/6**, davon vier
bisherige Lecks geschlossen; Roots echte Toolereignisse **10/10**, davon acht
bisherige Lecks geschlossen. Alle verwendeten Secrets wurden dort über echte
`request.respond`-Pfade des Fake-Gateways gelernt, die Browserausgaben bleiben gültig.

Die vollständigen Phase-7-Overlap-, Raw-/Escaping-, Langpräfix-, Crop-,
Stream-, späten HOME-Await- und Gesamtbudgetkontrollen bleiben grün.

## M1: Beobachteter HOME-Verlust widerruft die Generation

Jeder tatsächlich erkannte HOME-Identitätsverlust wird vor der Fehlerantwort
monoton im Ressourcenhost committed. Dies umfasst verlorene Pfade, Symlinks,
abweichende Inoden und einen asynchron beobachteten Ersatzinode, auch wenn A
vor dem späteren Assert bereits wiederhergestellt wurde.
Ein altes Scope-Token und alte Kontextobjekte bleiben nach A→B→A ungültig.
Ein neuer Read kann einen neuen stabilen Scope liefern. Unveränderte Identität
bestätigt weiterhin denselben Scope, auch ohne Chatlease.

Belege: unveränderte HOME-Gruppen **3/3**. Der zuvor rote Fall liefert nach
beobachteter 409 und Wiederherstellung weiterhin **409/not_sent, null Sends**.
Fünf zusätzliche dauerhafte Fälle prüfen Verlustarten, Wiederherstellung,
asynchronen Ersatzbeleg, frische Freigabe und unveränderten gesunden Kontext.

## M2: Deletecleanup bindet sich an die vor Send belegte Generation

Unmittelbar vor dem einmaligen nativen DELETE werden nur tatsächlich inaktive
Records mit exakter Objekt-, Binding-, Transport-, Snapshot-, Work-, Hydrierungs-
und Subscriptiongeneration erfasst. Nach dem frischen Abwesenheitsread und der
finalen Ausgabebindung wird ausschließlich ein unveränderter solcher Record
bereinigt. Neu angelegte oder erneut hydrierte Records sowie neue Leases,
gepufferte Events, Queue, offene Requests und geschützte Arbeit bleiben erhalten.

Der Beginn einer erneuten Subscription sowie jeder Snapshotversuch erhöht eine
lokale Hydrierungsgeneration. Ein inzwischen wieder inaktiver Zustand allein
reaktiviert deshalb keine alte Cleanupberechtigung. Es gibt keinen Stop/Kill.
Native Quittung, tatsächlicher Abwesenheitsread und exakte bestätigte IDsemantik
bleiben erhalten; fremde Profile und andere IDs werden nicht abgeleitet bereinigt.

Belege: unveränderte Deletegruppen **4/4**, beide zuvor roten echten
Hydrierungen mit/ohne gepuffertem `message.start` jetzt grün. 13 zusätzliche
dauerhafte Fälle prüfen diese echten Abläufe, neue lokale Generationen und den
gesunden unveränderten Idlecleanup. Native Sends bleiben jeweils einmalig.

## L1: Stabile unlesbare Datei erhält den richtigen Status

Ein tatsächliches `open`-EACCES/EPERM wird nach frischer Kontext-, Elternpfad-
und Dateidentitätsprüfung als `unreadable` mit `text:null` ausgewiesen.
Beobachtete Austausch-, Symlink- oder Verlustfälle bleiben `unknown`.
Belege: unveränderte Boundarygruppen **26/26**, einschließlich echter
000-Datei. Vier neue dauerhafte Fälle prüfen Berechtigungsfehler und Identitätsrennen.

## Root-H2: Chatdisplay vor Kürzung und nach später Secretkenntnis schützen

Finaltext, Reasoning, Interim, History, Inflight und verwandte Toolanzeigen
schützen den rohen bekannten Inhalt vor der Feldbegrenzung. Streamchunks
schützen Volltreffer vor Normalisierung und behalten mögliche Chunkpräfixe für
den vorhandenen verbindungseigenen Streambuffer. Es gibt keine neue Registry
und keinen unbeschränkten Buffer.

Die finale Browserprojektion verwendet den geprüften begrenzten Präfixschutz
auch für bereits gekürzte Anzeigeinhalte. Deshalb werden gecachte Snapshot-,
History- und Replayanzeigen nach später Secretkenntnis erneut geschützt.
Routingkennungen, Occurrences, Requests, Protokollzustände und native IDs bleiben exakt.

Belege: Roots unveränderter Chatpräfix-Repro **2/2**, ohne Learn normale
Sichtbarkeit und mit genau einer echten Antwort kein sichtbarer Secretpräfix.
20 neue dauerhafte Rawoutputfälle prüfen echte Tool-/Historypfade, Replay,
Text/Reasoning/Interim/Chunks, spät neu projizierte Cacheframes, erhaltene normale
Inhalte, beide Registrierungsreihenfolgen und kleine JSONbegrenzungen.

## Prüfungen auf dem eingefrorenen Stand

Alle Logs, eigenen bytegleichen Reprokopien und Ergebnisse liegen unter
`temp/hermes-v2/phase8-backend-fixes/`.

| Prüfung | Ergebnis |
| --- | --- |
| Vollständige Hermes-Suite, cache=false | **781/781**, 80 Dateien |
| Davon unveränderte bisherige Fälle | **702/702**, plus 79 neue additive Regressionen |
| V2-Contracts, vier bestehende Testdateien | **23/23**, unverändert |
| Unveränderte R1-Gategruppen | **71/71**, zuvor 57 gesund und 14 rote gesunde Sollfälle |
| Rootrepros Plaintext / Tool / Chatpräfix | **6/6 + 10/10 + 2/2** |
| Unveränderte gesunde R5-Gruppen | **234/234** |
| R5-Aufteilung | Metadaten8, Budget27, Verhalten53, Präfix48, Settlement8, Await80, Behavior10 |
| Contracts-tsc in eigenem Ausgabeordner | grün |
| Vollständiges `pnpm typecheck`, einschließlich Web und E2E-Typen | grün |
| Servertypen separat, Scope-ESLint ohne Warnungen | grün |
| `pnpm architecture:file-lines` | grün, keine Baselineänderung |

Die fünf neuen Testdateien enthalten Credentialstruktur37, HOME5,
Deletecleanup13, Filepermission4 und Rawoutput20 Fälle. Alle alten Assertions
und Fixtures wurden beibehalten. Die 71 Gategruppen verwenden ihre sechs
originalen Skripte; beide Root-H1-Repros und Root-H2 ebenfalls unverändert.

Die erste R5-Runnerkopie scheiterte vor Testausführung an einem zu langen
tsx-Unix-Socketpfad. Der direkte Node-tsx-Loader mit kurzem Tempverzeichnis
führt dieselben unveränderten Skripte aus; alle sieben Gruppenrunner sind terminal grün.
Historische defekte/negative Cases und der bekannte widersprüchliche alte
Lifecycle-Timeout wurden nicht umgedeutet und nicht erneut als gesunde Gruppen gezählt.

## Exakter Scope und Freeze

Öffentliche HTTP-, Event- und Contracts-Shapes bleiben unverändert.
Gegenüber dem alten 209er Freeze sind **191 Quellen byteidentisch**, 18 geändert,
sieben neu. `source-diff.json` enthält pro Datei vorher/nachher SHA und Zeilenzahl.

Geändert unter `apps/server/src/hermes/`: `redaction.ts`; unter `v2/`:
`secret-redactor.ts`, `normalize-values.ts`, `normalize-events.ts`,
`normalize-history.ts`, `normalize-sessions.ts`, `session-service.ts`,
`snapshot-tools.ts`, `redact-browser.ts`, `manager.ts`, `operations.ts`, `types.ts`;
unter `v2/resources/`: `context.ts`, `host.ts`, `files.ts`, `projection.ts`,
`session-delete.ts`, `routes.ts`.

Neu: `v2/redaction-ranges.ts`, `v2/resources/delete-cleanup.ts` sowie
`v2/raw-output-regressions.test.ts` und unter `v2/resources/`
`credential-structure.test.ts`, `home-loss.test.ts`,
`delete-cleanup-regressions.test.ts`, `file-permission.test.ts`.
Alle 25 geänderten/neuen Handdateien halten das 400-Zeilenlimit ein.

Neues Manifest: `temp/hermes-v2/phase8-backend-fixes/code-freeze.json`, **216 Quellen**.
SHA-256: `7530f85494cc2cc2e6a971c0504cc62d932d175b6f855bbfb0db37cd53226b18`.
`freeze.py --verify` prüft zusätzlich **1747/1747** geschützte Altartefakte,
**86/86** alte Tests/Fixtures aus dem bisherigen Quellmanifest und **81/81**
bytegleiche kopierte Repro-/Support-/Runnerquellen gegen ihre Originale.
Das alte 209er Manifest bleibt byteidentisch mit SHA
`fc080a320ae04b2025e0f554957636c4fd18a7ff35411a18c7463445b37e51e8`.

Keine Client-/UI-/Root-E2E-Dateien oder alten Berichte wurden bearbeitet.
Keine echte Coremutation, CLI-, Dienst-, Preview-, Browser- oder Gitaktion.
Nur eigene Fakes, temporäre Dateien/SQLite und eigene Loopbackverbindungen.
Version, Changelog, echte Ressourcen-Smokes und Gesamtfreigabe bleiben bei Root.
Produktcode ab jetzt eingefroren; nächster Schritt ist das unabhängige R2.
