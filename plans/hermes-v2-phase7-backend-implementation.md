# Phase 7: Backend und Contracts

Stand: 17.10.2026. Ausschließlich ausdrücklich freigegebener Phase-7-Backendscope.
Originalauftrag, Workhandoff, Backendtask und frisches Phase-6-Backendgate vollständig gelesen.
Keine Phase 8, kein unabhängiges Gate-PASS und keine Client-/UI-/Realruntimeabnahme.

## Vertrag und Integration

Der feste Vertrag steht in `plans/hermes-v2-phase7-interface.md`, unter180 Zeilen.
Contracts vor dem Clienthandoff tatsächlich gebaut und Root/Clientautor benachrichtigt.
`work=1` ist ein separates explizites Gatewayquery-Optin. Ohne dieses werden neue
Ops abgewiesen und work.updated/work.invalidated im tatsächlichen Sendepfad entfernt.
Bestehende subagents.read-, Snapshot-, Composer- und alte Eventframes bleiben erhalten.
session.steer liefert auch typseitig exakt queued|redirected|rejected; Wirewerte unverändert.

Neue Ops: work.read, work.subagent.interrupt, work.subagent.tail, work.process.kill,
work.background und work.btw. Kein freies RPC, globales agents.list/process.stop oder StopTree.
Der neue Contract `hermes-v2-work.ts` definiert vollständige begrenzte Roster,
optionale Teilpatches, nullable Fakten, exakte Nativeausgänge und explizite Teilabdeckung.

## Struktur und echte Daten

Neue fachliche Module unter `apps/server/src/hermes/v2/work/`: normalize, roster,
state, binding, service, operations und redact. Keine neue Hermesruntime oder Queueengine.
`GatewayRequestLifecycle` übernimmt Anfragekontext, Registrybeobachtung und Replayabgleich
vom Manager. Seine bestehenden Aufrufer bleiben erhalten; Manager jetzt376 statt397 Zeilen.

subagent.list und process.list bleiben die native Sessionquelle. Native Livekinder und
konkret beobachtete Kinder, kürzlich fehlgeschlagene Delegationen, eigene Prozesse sowie
Background/Btw sind getrennte Domänen. DelegationId **und** taskIndex identifizieren
Fehlerdelegationen. Gleichlautende Kennungen verschiedener kind-Domänen kollidieren nicht.
Parent/Depth/Goal/Modell/Start/Toolcount/Steerfähigkeit entstehen nur aus vorhandenen Belegen.
Fehlende Werte bleiben null, Parentzyklen werden nicht rekursiv traversiert oder autorisiert.

spawn_requested/start/progress/thinking/tool/complete werden als optionale Patches
normalisiert. Ausgelassene Felder löschen keine früheren Angaben. Status wird aus
konkretem Typ/Payload abgeleitet; Complete ohne Ergebnisstatus bleibt status=null,
belegt intern aber Settlement. Verschwindende Zeilen werden nicht zu completed geraten.
Bereits terminale Kind-/Delegations-/Nebenaufgabenstände werden durch verspätete
Start-/Progress-/Receiptinformationen nicht wieder running.

work.read ersetzt die ganze begrenzte Sicht. Eine während des Reads geänderte
Workrevision verwirft den alten Read vor Projektion. Gleichzeitige Reads derselben
Connection-/Abo-/Runtime-/Transport-/Scopegeneration werden zusammengefasst.
Reads/Tail blockieren die Mutationswarteschlange nicht; Stop bleibt während Workreads erreichbar.
Neue Mutationen bleiben in der bestehenden SessionOperationQueue.

## Aktionen, Queue und Bindung

Vor Interrupt/Tail/Kill steht ein neuer eigener nativer Roster. Lokale historische
Events oder eine freie Ziel-ID genügen nie zur Autorisierung. Sichtbare durable Lineage
beweist keine genaue aktuelle Steuerbarkeit: found=false und available=false bleiben
ehrliche Nativeantworten. Kill erhält killed/already_exited/not_found/error und Exitcode.
Nebenaufgaben liefern echte task_id. Eine konkrete Completion darf vor dem Startreceipt
oder ganz ohne beobachteten Start eintreffen und bleibt ihrem kind/task_id zugeordnet.
Nebenabschluss beendet niemals den Hauptturn oder andere Nebenaufgaben.

Queuekopf stammt ausschließlich aus dem bestehenden sessions.writable/Activate-Reply.
Das native queued.user ist genau der nächste Kopf, keine FIFO/Anzahl. mode=queue sendet
weiter queued=true. Weder spätere Submitquittung noch rejected-Steer ersetzt den Kopf.
Keine zweite Snapshotengine, kein Delete/Reorder und kein automatischer Mutationsretry.

Capture und letzte Checks bewahren Owner, ursprüngliche Connection, Workoptin,
Abogeneration, Sessionrecord, canonical/live/epoch/Transport, erlaubtes CWD und dessen
kanonisches Ziel sowie bestätigtes Profil/HOME mit bestehender Scopebeobachtungsrevision.
Eine kleine interne contextRevision erhält zusätzlich beobachtete Profil-/CWD-A-B-A-Wechsel
über Awaits und spätere frische Activateantworten. Partielle Infoevents bleiben partiell.
Nach möglicher Nativeannahme wird dieselbe Bindung ohne reaktivierendes writable erneut
geprüft. Erkannter Kontextverlust ergibt unknown und konservative Runtimehaltung.

## Begrenzung, Geheimnisse und Lifecycle

Pro Domäne höchstens100 flüchtige Zeilen, zentral über die vorhandene Policy begrenzt.
Kein privater Prompt-/Outputstore in Wrapt-SQLite. Tail/Prozessoutput/Nebenaufgabentext
halten16KiB auch bei Mehrbytezeichen. Felder, Zeilen und Gesamtroster werden begrenzt;
Kürzungen stehen in coverage.truncated. Identitäten bleiben exakt, Anzeigetexte werden
statisch und gegen die laufende Secretregistry redigiert, einschließlich Modell/Fehler.

Kein neuer Timer oder Poller. Strukturereignisse invalidieren Roster/Queue; Thinking- und
Toolfortschritt fordert keine Katalog-/Sidebarreads an. Native Lifecycle-Reads sind coalesced
und prüfen Live/Epoche/Transport vor Übernahme. Eigene SideTasks und beobachtete Prozesse
überleben Flagoff bis belegtem Settlement. Unknown und fehlende Identität entsorgen keine
aktive Runtime. Bei Source-/Transportwechsel keine alten Roster-/Taskinhalte übernehmen.

## Prüfungen

Eigene Protokolle/Runner: `temp/hermes-v2/phase7-backend/`.

- Gesamte Hermes-Suite: **496/496**, 52 Dateien grün. Alle bisherigen424 Fälle unverändert
  erhalten, dazu72 neue bedeutsame Workfälle in sechs Testdateien.
- Composer-/Organization-/Work-Contracts: **9/9**, drei Dateien grün, davon sechs Alt- und
  drei neue Vertragsfälle. Öffentliche Contracts real in Package-dist gebaut, zusätzlich
  isolierter Testbuild unter eigenem dist/contracts.
- **248/248** unveränderte externe positive Gruppen grün: R1/R2/R3 138, frische56,
  jüngstes unabhängiges Phase-6-Gate54. Originalrepros und Altberichte nicht verändert.
- Sechs alte Fehlerrepros erneut ausgeführt: beide R2-Historyrepros grün. Drei R1-Repros
  erwarten die inzwischen verhinderten Bugs und enden entsprechend mit Exit1.
  home-fs-boundary zeigt null Stage/null Dateien/not_sent; sein bekannter Exit1 stammt
  von der unbedingten Native-Datei-Vorassertion. Kein solcher Exit zählt als gesunder Check.
- Neue Gegenfälle: tatsächliches work=1-WebSocketquery und Legacyprojektion; vollständige
  Roster/Teilpatches; IDs/Delegationsindex/Parentzyklen; Secrets und Kürzung; exakte native
  Resultate; Completion vor ACK/ohne Start/dupliziert; echter Queuekopf/Steerrejected;
  parallele coalesced Reads und Stop; echte FS-Awaits vor/nach Send mit Scope-/Profil-/
  CWD-A-B-A, Flag, readonly, Workoptout, Abo-, Connection-, HOME- und Transportwechsel;
  verlorene echte Fakequittungen ohne Retry; eigene Prozess-/Nebenaufgabenhaltung.
- Explizite Servertypen, ScopeLint mit max-warnings=0 und architecture:file-lines grün.
  Abschließendes pnpm typecheck vollständig grün, einschließlich Web und E2E.
  Der zuvor parallele unbenutzte HermesV2WorkPanel-Import blockiert diesen Lauf nicht mehr.
- Alle neuen/angepassten Handdateien unter400, keine Baseline erhöht. SHA-256 bestätigt
  alle46 alten Testdateien und416 alte Review-/Gateartefakte unverändert. Nur die eigene
  etablierte FakeGateway-Fixture erhielt einen optionalen Drop-Reply-Schalter; Defaultverhalten
  und sämtliche alten Assertions bleiben erhalten.

## Grenzen und Freeze

Native Fehlerdelegationsreads können intern still leer werden; deshalb bleibt deren
Abdeckung recent-failures-partial. Für Background/Btw fehlt ein vollständiger nativer
Laufroster. Nach Reconnect wird keine fehlende laufende Aufgabe erfunden. Eine native
Completion liefert Text, keine verlässliche strukturierte Fehlerklasse. Unbekannte
Mutationen oder verlorene aktive Beobachtungen können ohne späteren Beleg konservativ
gehalten bleiben. Das ist keine vollständige globale Aufgabenabdeckung.

Alle akzeptierten Phase-2-/4-/6-Grenzen bleiben bestehen: kein atomarer externer Core-CAS,
keine Dateisnapshot-/Vision-/PDF-Garantie oder zusätzliche native HOME-Attestation.
Kein eigener Agent-/Cron-/Queue-/StopTree-Ersatz. Root übernimmt Browser und echte Integration.

Backendcode, neue Tests und Contracts jetzt ausdrücklich eingefroren. SHA-256 aller159
Quellen in `temp/hermes-v2/phase7-backend/code-freeze.json`. Änderungen erst nach konkreter
neuer Rootfreigabe. Keine echten Coremutationen, CLI-/Dienst-/Git-/Browser-/Preview-/Account-
oder Nutzerdatenaktionen und keine weiteren Agents. Nur eigene Fakes/Dateien/SQLite/Loopback.
Versions-/Changelogpflege verbleibt beim Root-Orchestrator. Kein Phase-8- oder Gesamt-PASS.
