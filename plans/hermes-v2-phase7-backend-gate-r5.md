# Hermes V2 Phase 7: unabhängiges Backend-/Contracts-Gate R5

Stand: 17.10.2026. **Verdikt: PASS ausschließlich für das gezielte Backend-R5-Gate.**
**R4-L1 Low unabhängig geschlossen. Keine weiteren Findings in diesem Scope.**
Keine Produktkorrektur vorgenommen. Keine Browser-, Realcore-, UI-, Phase-8- oder
Gesamtfreigabe. Reale Arbeit und Gesamtintegration verbleiben beim Root.

## Grundlage und Freeze

Originalauftrag, AGENTS.md, R4-Bericht und vollständige Autorenantwort gelesen;
Phase-7-Vertrag und tatsächliche Budget-/Sendepfade gegengeprüft. `sprachstil`
angewandt. Produktversion und Changelog bleiben ausdrücklich beim Root.
R5-Artefakte ausschließlich unter
`temp/hermes-v2/phase7-backend-gate-r5-20261017/`, nachfolgend R5-Temp.

Verbindliches R4-Manifest unabhängig vor und nach Prüfung bestätigt: **175/175**.
SHA256 `aba41a0bfcb354a1bdd0ba035f41095cecd7eb5dbc28fa2aa9daad3ddf8bd3a1`.
R3-Manifest ebenfalls mit dem vorgegebenen SHA256 bestätigt. Von dessen174 Quellen
sind **172 byteidentisch**. Neu ausschließlich `work/metadata-budget.test.ts`
mit14 Fällen. Vorherquellen der beiden Änderungen gegen die R3-Hashes geprüft.

Exakter Produktionsdiff, relativ zu `apps/server/src/hermes/v2/`:

- `work/service.ts:89`: zusätzliches Argument `"rows"` bei der halben Vorquote.
- `work/output-budget.ts:5`: interner Modus mit unverändertem Standard `complete`.
- `work/output-budget.ts:15`: Rückkehr nach Zeilenbegrenzung im Modus `rows`.

Keine weitere Produktionsänderung, keine Contract-/APIänderung. Secretredactor,
Normalisierung, finale Redaction/Sendefunktion, Identitäts-/Owner-/Scope-/CWD-/HOME-/
Awaitprüfungen, Lebenszyklus und Legacyprojektion bleiben byteidentisch.
Der breite R4-Vergleich bestätigt ebenfalls nur diese zwei Codeänderungen;
separat veränderte Root-/Phase-8-Auftrags- und Fortschrittsdokumente sind ausgewiesen.
Bestehende Webquellen unverändert, daher keine komplette Websuite nötig.

## R4-L1: unabhängig geschlossen

Die Vorquote entfernt weiterhin Zeilen und meldet deren Verlust. Sie verwirft
keine Metadaten oder Queue mehr. Der unveränderte finale Sendepfad entscheidet
nach Redaction anhand des tatsächlichen Browserbudgets abzüglich des exakt
serialisierten Wrappers. Standardaufrufe von `boundWorkRoster()` bleiben hart.

Unverändertes R4-`metadata-budget-controls.mts`, bytegleich gespiegelt: **8/8**, Exit0.
Bei512 Bytes sind beide echten Managerantworten jetzt schema-valide `work.read`-
Results: leer **354 Bytes**, UTF8-/JSON-Queue **512 Bytes/73 UTF16-Codeeinheiten**.
Die sechs Gegenfälle bei640/1024/1048576 bestehen ebenfalls. Queueframes haben
640/1022/1452 Bytes; beim Default bleibt der vollständige500-Einheiten-Kopf erhalten.
Je Versuch genau ein zusätzlicher `subagent.list`- und `process.list`-Read,
null Mutationen und kein Retry. Native Eingabelisten bleiben bytegleich.

Eigene `r5-controls.mts`: **53/53 gesunde Sollgruppen**, Exit0:

- 24 echte Managerfälle:512/640/1024/1MiB, null/leere/kleine Queue sowie große
  UTF8-, JSON-Escape- und gemischte Köpfe. Vollständiger Frame unter Budget,
  gültige Präfixe ohne abgeschnittenes Surrogat, ehrliche vollständige Coverage.
- Drei exakt passende echte Managerframes einschließlich UUID-/Resultwrapper:
  **354**, **352**, **377 Bytes**, jeweils exakt gleich Budget. Null-, Leer- und
  gemischter Queuekopf bleiben vollständig, `coverage.truncated=false`.
- 16 frühe/späte Secretfälle: alle vier Budgets, UTF8 und JSON-Escapes. Späte
  Kenntnis erst am tatsächlich erhaltenen post-Native-HOME-lstat; echte Secret-
  Requests, reguläres `request.respond` und tatsächliche Nativeantwort. Finaler
  Managerframe maskiert, budgetgerecht und mit tatsächlicher Verlustangabe.
- Acht große Rosterfälle: je100 native Kinder/Delegationen/Prozesse und100 über
  echte Ereignisse beobachtete Nebenaufgaben. Alle vier Budgets, frühe/späte
  Maskenexpansion,200-Zeichen-Routingkennungen einschließlich bekanntem Secretwert.
  Erhaltene IDs/Parent-/Delegationskennungen bleiben exakt, Eingaben unverändert.
  Kleine Budgets ergeben einen gültigen leeren Ausschnitt mit ehrlichem Verlust.
  Eigene Defaultframes:514595 beziehungsweise1044613 Bytes, beide unter1MiB.
- Wirklich unmögliche256 Bytes: zulässiger Servicezwischenroster bleibt erhalten;
  erst der echte finale Managerpfad liefert `RATE_LIMITED/not_sent`.
- Isolierter Modusvergleich: `rows` erhält Queue und Eingabe; der Standardmodus
  verwirft unmögliche Metadaten weiterhin. Echte finale Sendefunktion begrenzt
  denselben Ausgangsframe auf512 Bytes mit korrekter Coverage.

Alle eigenen Managerreadfälle prüfen zusätzliche Native-Reads und null mutierende
RPCs, einschließlich Stop/Kill/Interrupt. Secretantworten werden separat belegt.
Vor den großen Reads werden durch Completionereignisse gestartete Lifecycle-Reads
abgewartet. Kein Produktpfad wird ersetzt, keine Registry direkt manipuliert.

## Erhaltene Budgetassertionen und konkrete Wirkung

Unverändertes R4-`budget-controls.mts`: **27/27**, Exit0. Darin100 Prozesse mit
exakt4000 nativen Codepoints,32/64KiB/1MiB, frühe/späte Expansion,200-Zeichen-IDs,
echter Gesamtwrapper, Queue-UTF8/JSON, Eingabeschutz und unmögliche Metadaten.
Ungültige200-Zeichen-Envelope-ID weiterhin abgewiesen; gültige Envelope-UUID36.
Alle alten Assertions erhalten, einschließlich bisheriger Zeilenauslassungen.

Einzelvergleich mit den R4-Ergebnisdateien: **alle Rosterresultate unverändert**.
Nur sechs Queuegruppen dieser27 haben längere zulässige Ergebnisse:
bei1024 Bytes142→379 UTF16-Einheiten und603→1024 Framebytes;
bei2048 Bytes430→955 und1115→2048;
bei16384 Bytes4462→9019 und8283→16384, jeweils früh und spät identisch.
Alle weiterhin ehrlich `truncated=true`. Im Metadatenrepro wachsen zusätzlich
die gültigen640-/1024-Queueframes von409/604 auf640/1022 Bytes.
Dies sind Fixturemesswerte; Zeilenzahlen sind keine APIgarantie.
Details: `generated/r4-result-comparison.json` im R5-Temp.

## Erhalt der bisherigen Schutzgrenzen

Gezielte bereits unabhängige, unveränderte Kontrollen selbst ausgeführt:

- R4-`prefix-controls.mts`: **48/48**. Überlappende Kurz-/Langwerte, vor/nach
  echtem HOME-Await bekannte Werte, native und bereits beobachtete Textfelder,
  Raw-/JSON-/Mehrbytevarianten, exakte Routingidentitäten und native Secretantworten.
- R4-`settlement-controls.mts`: **8/8**. Echter Socket hält eigenen Prozess ohne
  UI-work.read bis frischem Settlement; Idle gibt frei. Completion vor Receipt
  bleibt nach131 weiteren Abschlüssen terminal, Belegverlust ergibt unknown/Haltung.
- `await-controls.mts`: **80/80** über alle vier Mutationen, vor/nach Await.
  Profil/Scope/CWD-A-B-A, HOME, Generation, Verbindung, Optout, readonly, Transport.
  Nullsend bleibt not_sent, mögliche Annahme unknown/ein Send und Haltung, kein Retry.
- `behavior-controls.mts`: **10/10**. Zielautorisierung, Routing, native false- und
  Killstatuswerte, wirklicher Queuekopf, abgelehntes Steer, Readkoaleszierung,
  Stopreserve, passive Tokens sowie echte Legacy-/Workoptin-WebSocketprojektion.

Diese146 Schutzgruppen,35 R4-Budgetgruppen und53 eigene Gruppen bestehen jeweils
mit Exit0. Keine neue allgemeine Auditwelle; die484 fremden Altgruppen nicht erneut
komplett ausgeführt. Bekannter widersprüchlicher alter lifecycle-controls,
negative historische Bugassertionen und HOME-Vorassertion weder wiederholt noch
als PASS gezählt. Die akzeptierten gesunden Ersatzkontrollen bleiben maßgeblich.

## Suiten, Pflichtchecks und Prüfartefakte

**612/612 aktuelle Hermesfälle**,65 Dateien, --cache=false; alle bisherigen598
erhalten. **9/9 Hermes-Contracts**, drei Dateien. Jeweils unabhängig Exit0.
Isolierter Contractsbuild, Servertypen, vollständiges `pnpm typecheck` einschließlich
Web/E2E, Scope-ESLint mit --max-warnings=0 und `pnpm architecture:file-lines`: Exit0.
Die14 isoliert kompilierten Hermes-Runtime-JS-Dateien stimmen mit den tatsächlich
verwendeten Contractexports bytegleich überein. Keine Baseline erhöht.
Reproduzierbare Befehle/Exitcodes: R5-Temp/`verify.py`, Gruppen `budget`, `own`,
`protection`, `suite`, `static`; zugehörige *-exits.json, *-results.json und Logs.

Eigene Anfangsfehler erhalten: erster Spiegelcheck bezog alte Ergebnis-JSONs ein;
auf Skript-/Fixturequellen begrenzt, keine fremde Quelle geändert. Große eigene
Fixture zählte noch laufende Completion-Lifecycle-Reads, initial45/53, Exit1;
reale Lifecyclebarriere ergänzt, danach53/53. Erster Architekturcheck scheiterte
ausschließlich an zwei eigenen generierten Hashmanifesten. Auf Rootvorgabe nach
`generated/` verschoben, Verweise angepasst, unveränderte Architekturprüfung grün.
Initiallogs/-resultate bleiben separat erhalten. Keine fremde Assertion verändert.

## Abschluss und Grenzen

Final **175/175 Freezequellen**, **1819/1819** eigene geschützte Anfangsartefakte
und **292/292** Skript-/Fixturekopien unverändert. Keine neue Produktquelle.
Nachweis: `check-freeze.py --require-report`, `freeze-final.json`, Hashmanifeste
unter `generated/`. Bericht unter180 Zeilen, handgeschriebene Quellen unter400.
Alle Testprozesse beendet, Fakes/Sockets/SQLite geschlossen, HOME-Hooks restauriert.
Eigene Fallordner und Runtime-Tmpbaum entfernt; `resource-cleanup.json` belegt dies.
Keine echten Core-/CLI-/Dienst-/Preview-/Slot-/Account-/Gitaktionen, keine Agents.

Native Workcoverage bleibt partiell, Queue next-only, StopTree unsupported.
Bisher akzeptierte Core-/Dateisnapshot-/HOME-Grenzen unverändert. Client-R3 und
DeepSeek-UX separat PASS, drei UX-Lows bleiben Phase9. Root besitzt Real-Smoke,
Gesamtintegration, Doku und Versionierung. **Backend R5 kann übernommen werden.**
