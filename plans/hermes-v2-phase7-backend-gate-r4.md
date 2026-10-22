# Hermes V2 Phase 7: unabhängiges Backend-/Contracts-Gate R4

Stand: 17.10.2026. **Verdikt: needs fixes ausschließlich für Backend R4.**
**R3-H1, R3-L1 und die ursprüngliche R3-L2-Überschreitung geschlossen.**
**Neu offen: R4-L1 Low, erfüllbares kleines Browserbudget wird vorzeitig abgewiesen.**
Keine Produktkorrektur vorgenommen. Keine Client-, UI-, Browser-, Realruntime-,
Phase-8- oder Gesamtfreigabe. Root beim konkret belegten neuen Low früh informiert.

## Grundlage und Verfahren

Originalauftrag, Phase-7-Vertrag, Backendauftrag, Implementierungsbericht, R1/R2/R3-
Gates und alle drei Fixantworten gegen die Quellen geprüft. Betroffene abschließende
Phase-2-Security-R3-/Vorsend-R5-, Phase-4-Backend-R4- und Phase-6-R3-/Nachsendgates
samt Antworten nachgelesen. Persönliche sprachstil-/Versionierungen-Regeln und
Projekt-AGENTS angewandt. Autorenbelege ersetzen keine unabhängigen Sollassertionen.

Verbindlicher Freeze vorab selbst bestätigt: **174/174 Quellen identisch**,
Manifest-SHA256 `79300dec74155251899aa39692767fadbe9184d64618e30134e4f7d211bf7c51`.
Eigene Fakes, SQLite, Dateien, Ergebnisse und Logs ausschließlich unter
`temp/hermes-v2/phase7-backend-gate-r4-20261017/`, nachfolgend R4-Temp.
287 fremde Skript-/Fixturequellen byteidentisch gespiegelt. Relative Produktimporte
führen über Lesesymlinks; fremde Assertions und Ergebnisdateien bleiben unverändert.
Eigene neue Kontrollen verwenden die etablierte isolierte FakeGateway-/Poolfixture.
Echte Fake-WebSockets, reguläre Managerantworten und echte Native-Secretantworten;
HOME-Hooks halten ausschließlich tatsächlich erhaltene post-Native-lstat-Ergebnisse.
Keine Produktfunktion ersetzt und kein Registryeingriff als Ersatz für Managerfälle.

## R3-H1, High: unabhängig geschlossen

Quellen relativ zu `apps/server/src/hermes/v2/`: `secret-redactor.ts:58`, `:59`,
`:107`, `:123`, `:129`; Aufrufer `work/normalize.ts:9`, `work/redact.ts:12`.
Rawpräfix und Volltreffer werden vor der ersten Kurzmaske am selben Eingang erfasst.
Berührende Volltreffer erweitern den zurückgehaltenen Rawbereich. Der nachgelagerte
Präfixcheck nach Begrenzung zerstört diesen bereits gesicherten Beleg nicht mehr.

Unveränderte R3-Repros selbst wiederholt: `late-overlap.mts` **6/6**, `late-overlap-
fields.mts` **14/14**, beide **Exit0**. Alle zuvor scheiternden gesunden Sollassertionen
bestehen. Die beiden Prozessoutputfälle über4000 nativen Zeichen bleiben separat
defensive Kontrollen und tragen keinen normalen High-Nachweis.

Eigene `prefix-controls.mts`: **48/48** Gruppen. Präfix/Mitte/Suffix, beide
Registrierungsreihenfolgen, vorher und erst während echtem post-Native-HOME-lstat
bekannte Werte; ASCII, Raw-Escaping, JSON-Escaping und Mehrbyte. Pro Gruppe normale
Goal-/Modell-/lastTool-/Delegationsgoal-/Fehler-/Commandfelder und bereits wirklich
beobachtete Subagent-/Delegationsevents im Cache. Zwei reguläre request.respond und
zwei tatsächliche Nativeantworten; gültiger finaler Managerframe. Das komplette zuvor
abgeschnittene Präfix wird jeweils `***`. Derselbe ASCII-Secrettext als native ID,
Parent-ID und Delegations-ID bleibt exakt. Native Eingabelisten bleiben unverändert.

Eigene unabhängige Intervallreferenz `mask-oracle-controls.mts`: **28/28** Gruppen,
**1824** bounded-/Volltextvergleiche und **1316** weitere Streamtrennstellen. Darin
drei überlappende Werte, Selbstüberlappungen und alle Registrierungspermutationen.
Zusätzlich alle **1858** alten message/reasoning-Trennstellen selbst wiederholt.
Registrykapazität bleibt atomar vor Nativeantwort, Stream-/Präfixüberlast unterdrückt
konservativ. Statisch: KMP-Nachweise nutzen ein eingangslanges Uint32Array, keinen
mit Trefferanzahl unbegrenzt wachsenden Store; Eingang durch upstreamBytes begrenzt.
Registry, Failuretabellen und Streamtails bleiben durch vorhandene Policies begrenzt.

## R3-L1, Low: unabhängig geschlossen

Quellen: `work/normalize.ts:7`, `:21`, `:28`; `work/roster.ts:20`;
`work/operations.ts:44`, `:46`; `work/redact.ts:12`, `:21`; `redact-browser.ts:75`.
Erste Tailprojektion vereinigt native und tatsächliche Kürzung; finale Projektion
erhält beide. Roster übernimmt Maskenverlust zunächst aus der Nativebeobachtung
und zusätzlich aus der finalen Redaction, ohne Eingaberoster/Coverage zu verändern.

Unverändertes `output-controls.mts` **Exit0**: Tail5462 Q plus `!` und Goal3334 Q
plus `!` melden tatsächlichen Verlust. Exakt5461 beziehungsweise3333 bleiben false.
Eigene `coverage-controls.mts`: **93/93** Gruppen. Alle ausgewiesenen Textfelder:
Subagentgoal, Delegationsgoal, Modell, last_tool/tool_name, Fehler, Command,
output_tail/output_preview, Background-/Btw-Text und Queue. Erste und finale Projektion,
echte späte Secretantworten am HOME-Await, exakte Zeichen-/UTF8-Grenzen und darüber,
Emoji an der Bytekante, schrumpfende Masken und unveränderte Eingabeobjekte geprüft.
Native Tail-truncated=true wird nie aufgehoben; reine Maskierung setzt kein pauschales true.
Prozessoutput-Kanten über der installierten Corecap sind nur defensive Zusatzfälle.

Die ausdrücklich berichtete Unterscheidung ist bestätigt: rohe Rosterfelder über
ihrer bisherigen Feldgrenze behalten konservative Coverage trotz späterem Schrumpfen.
Innerhalb dieser Grenze reicht gewünschte Maskierung nicht für truncated. Queue
behält ihre tatsächliche Verlustsemantik und darf bei Schrumpfen samt erhaltenem Ende
false melden. Keine verschwiegenen Gegenaussagen; alle45 alten R2-Kontrollen samt
konservativen Rohfeldassertionen unverändert selbst ausgeführt und bestanden.

## R3-L2, Low: ursprüngliche finale Überschreitung geschlossen

Quellen: `browser-output.ts:24`, `:26`, `:27`, `manager.ts:370`;
`work/output-budget.ts:5`, `:13`, `:19`, `:21`. Final redigierter Roster wird gegen
die tatsächliche Policy abzüglich exakt serialisiertem Wrapper begrenzt. Zeilen-/
Queueverlust setzt Coverage; Eingabe und Routingidentitäten bleiben unverändert.

Unveränderter echter R3-Managerrepro: frühes Q **43 Zeilen/522147 Bytes**, spätes Q
**86 Zeilen/1043952 Bytes**, jeweils unter1048576 und truncated=true. Installierte
Corequelle ausschließlich statisch gegengeprüft: `tui_gateway/server.py:3514`
begrenzt process.list-output_tail tatsächlich auf4000 native Zeichen.

Eigene `budget-controls.mts`: **27/27** Gruppen, darunter100 Prozesse mit exakt4000
nativen ASCII-Outputzeichen bei früher/später Q-Kenntnis. Browserbudgets1MiB,64KiB
und32KiB,200-Zeichen-Routingkennungen, JSON-Escapes und UTF8-Gegenfälle. Der größte
eigene ASCII-Managerframe hat1047977 Bytes,85 Zeilen und ehrliche Coverage. Echte
Queue-Read-/Sendepfade bei1024/2048/16384 Bytes behalten zulässige UTF8-/JSON-Präfixe.
Finale Eingabeobjekte bleiben bytegleich; unvermeidbar zu kleine Metadatenbudgets
werden abgewehrt. Request-Envelope-IDs sind vertraglich UUIDs mit36 Zeichen. Ein
200-Zeichen-Envelope ist ausdrücklich ungültig und wird abgewiesen, nicht maskiert.
Keine Browsercrash-/Disconnectbehauptung. Neue vorzeitige Untergrenze folgt separat.

## R4-L1, Low: halbe Vorquote lehnt erfüllbare Readantwort ab

Fundstellen: `apps/server/src/hermes/v2/work/service.ts:89` und
`apps/server/src/hermes/v2/work/output-budget.ts:19`.
Trigger: browserBytes=512, reguläres work.read, leerer nativer eigener Roster,
einmal ohne Queue, einmal mit einem UTF8-/JSON-Queuekopf. Der Service übergibt nur
256 Bytes an den neuen harten Metadatencheck. Dieser wirft vor der finalen Prüfung.

Repro `metadata-budget-controls.mts`: **Exit1**, zwei gesunde Sollgruppen scheitern.
**Ist:** echter Managerframe RATE_LIMITED/not_sent in beiden512-Byte-Fällen.
**Soll:** gültiger Roster, weil selbst der vollständige unveränderte leere Frame nur
**354 Bytes** benötigt. Dieselbe echte finale Sendefunktion bestätigt bei512 Bytes
den leeren Frame mit354 Bytes sowie einen ehrlichen gekürzten Queueframe mit
**512 Bytes/73 Textzeichen**. Keine erfundene Feld- oder Wrapperrechnung erforderlich.
Gesunde Gegenfälle: dieselben Readpfade bei640/1024/1048576 Bytes **6/6** bestanden.
Je Versuch ein zusätzlicher nativer Rosterread, null Mutationen oder Retries.

Wirkung: bei einem erfüllbaren konfigurierten Budget verschwindet die Workansicht
zugunsten einer falschen Budgetablehnung. Nur kleiner Policy-Grenzfall; Default und
die geprüften32/64KiB sind gesund. Kein Secretleck oder Prozessverlust behauptet.
Kleinste Fixrichtung: harte Metadatenablehnung nicht aus der pauschalen halben
Vorquote ableiten. Die echte finale Wrapperprüfung entscheidet über Unmöglichkeit;
eine Vorbegrenzung muss mindestens die tatsächlich darstellbaren Metadaten erhalten.

## Erhaltene Regressionen, Exitcodes und Pflichtchecks

- **598/598 Hermesfälle**,64 Dateien, --cache=false; **9/9** Work-/Composer-/
  Organization-Contracts,3 Dateien, jeweils **Exit0**. Alle alten543 Fälle erhalten.
- **484/484** externe gesunde Altgruppen unverändert selbst bestanden. Darin80
  Awaitgruppen aller vier Mutationen: Nullsend führt not_sent, mögliche Annahme
  unknown/ein Send und Haltung, kein Retry. Scope-/Profil-/CWD-A-B-A, HOME, Owner,
  Connection, Abo, Transport, readonly und Workoptout bleiben erhalten. Stopreserve,
  coalesced Reads, Nativefalse/Killstatus/Steerrejected und Workoptin/Legacy bestätigt.
  UID-/History-/Attachment-/SQL-/Organisations- und Originbindungen weiter geschlossen.
- Alle **50** alten gesunden R3-Gruppen samt1858 Streamtrennstellen sowie alle
  **20** vormals negativen R3-Sollgruppen bestanden, fünf Skripte jeweils **Exit0**.
- Eigene zusätzliche gesunde Gruppen **210/210**: Präfix48, Coverage93, Budget27,
  Intervallreferenz28, Settlement8 und Metadatengrenzen6. Zwei neue negative gesunde
  Sollgruppen bleiben offen. Der reine vierteilige Metadatenprobe-Exit0 ist kein PASS.
- Eigene `settlement-controls.mts` **8/8**: eigener Prozess hält echten Socket ohne
  UI-work.read bis frischem Settlement; Idle gibt frei. Completion vor Receipt nach
  131 weiteren Abschlüssen bleibt terminal. Voller Belegverlust ergibt unknown und
  Haltung. Beide kinds, genau ein Startsend, keine Stop-/Killaktion, Marker abgeräumt.
- Altes lifecycle-controls unverändert **Exit1**, erwarteter Deadlinewiderspruch
  Zeile21: hydrateWork=false verlangt Entsorgung vor gesunder Haltungsassertion.
  Weder PASS noch Fixregression.14 alte,16 R3- und8 eigene gesunde Gruppen prüfen
  Haltung/Settlement. Sechs alte Bugrepros unverändert: beide History-R2 **Exit0**,
  drei alte Bugassertionen **Exit1**; home-fs-boundary **Exit1** an Vorassertion41
  bei null Stage/null Dateien/not_sent. Diese vier Exit1 werden nicht gesund gezählt.
- Isolierter Contractsbuild im eigenen dist, Servertypen, Scope-ESLint mit
  max-warnings=0 und gesamtes pnpm typecheck einschließlich Web/E2E jeweils **Exit0**.
  architecture:file-lines auch nach Bericht **Exit0**; keine Baseline erhöht.

Eigene Anfangsfehler transparent: Coveragefixture war selbstperiodisch, ihre Volltreffer
überlappten korrekt; drei angebliche Within-Felder waren bereits roh zu lang, **Exit1**.
Nur eigene Fixture auf nicht selbstüberlappendes73-Zeichen-Secret geändert, danach93/93.
Metadatenkontrolle zählte zunächst Subscribe-Roster mit, **Exit1**; eigene Assertion
auf zusätzliche Reads korrigiert. Danach Exit1 ausschließlich wegen der beiden neuen
Sollfehler. Anfangslogs und Ergebnisse erhalten; keine fremde Assertion verändert.
Befehle/Exitcodes: R4-Temp/verify.py, own-exits.json, *-results.json und Einzellogs.

## Freeze, Ressourcen und Übergabe

Vor und nach diesem Bericht **174/174 Freezequellen unverändert**, keine neue Backend-/
Contractquelle. **287/287 Spiegelkopien byteidentisch**. Breite Baseline1717 Artefakte:
nur parallele Phase-8-Rootaufträge außerhalb des Freezes separat verändert;
Einzelvergleich in freeze-final.json. Alte Backendberichte, Assertions, Repros und
Fixtures bleiben unverändert. Eigene Handdateien unter400, Bericht unter200 Zeilen.
Alle eigenen Fakes, SQLite, Sockets, Dateihandles und FS-Hooks geschlossen/restauriert;
eigene Fall-/Runtimeordner entfernt. Keine echten Core-/CLI-/Dienst-/Browser-/Preview-/
Slot-/Account-/Git-/Nutzerdatenaktionen, kein produktiver Build/Restart, keine Agents.

Akzeptierte externe Core-CAS-/Dateisnapshot-/Vision-/PDF-/HOME-Attestationsgrenzen und
partielle native Workabdeckung bleiben erhalten. Produktversion/Changelog gehören
weiter Root. Client-R3 und DeepSeek-UX werden hier nicht erneut abgenommen; Root
besitzt Gesamtintegration und echten Work-Smoke. **Vor Backend-R4-PASS R4-L1 beheben.**
