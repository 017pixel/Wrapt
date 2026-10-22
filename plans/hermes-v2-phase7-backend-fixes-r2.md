# Hermes V2 Phase 7: Backendantwort auf Gate R2

Stand: 17.10.2026. R2-H1, R2-M1 und R2-L1 gezielt korrigiert und geprüft.
**167 Backend-/Contractquellen ausdrücklich eingefroren.** Kein eigenes Gate-PASS,
keine UI-, Realruntime-, Gesamt- oder Phase-8-Freigabe. Root übernimmt den Recheck.

## R2-H1: Reihenfolgeunabhängige Maskierung überlappender Secrets

`secret-redactor.ts` erkennt vollständige Treffer aller bereits bekannten Raw- und
JSON-Escapingvarianten am unveränderten Eingang. KMP erfasst auch Teilüberlappungen;
ihre Intervalle werden vor der Ersetzung vereinigt. Ein früher registriertes
kurzes Secret zerstört keinen späteren vollständigen Treffer. AB und BC maskieren
in ABC den gesamten betroffenen Bereich. Angrenzende Treffer bleiben getrennte Masken.

Streams berechnen mögliche Secretpräfixe ebenfalls am ursprünglichen kombinierten
Inhalt. Berührt ein vollständiger Treffer den zurückgehaltenen Präfix, bleibt sein
zusammenhängender Bereich roh im begrenzten Puffer. Dadurch kann ein vollständiger
kurzer Treffer einen möglichen langen Wert über Chunkgrenzen nicht teilweise ausgeben.
Bestehende Stream-/Bytekapazitäten und konservative Unterdrückung bei Überlast bleiben.
Keine neue Registry oder persistente Secretkopie. Der temporäre Treffernachweis wächst
mit dem bereits protokollbegrenzt angenommenen Eingang, nicht mit seiner Maskenexpansion.

`bounded()` maskiert vor Zeichen-/UTF8-Begrenzung und meldet tatsächliche Kürzung.
`boundedText()` behält seine String-API samt konservativem Schutz bereits gekürzter
Präfixe. Der allgemeine Legacy-Textpfad behält seine bisherige Feldlängenbegrenzung.
Routingkennungen, Protokollfelder und native Aktionen werden nicht pauschal maskiert.

Belege: unverändertes `overlapping-secrets.mts` **4/4** Gruppen grün, beide
Registrierungsreihenfolgen und Präfix-/Suffixteilwerte. Neues `security-overlap.test.ts`
prüft zusätzlich Mittelteile, Raw-/Escapingvarianten, jede Chunkgrenze, Einzelzeichen,
Teilüberlappungen, Bounds und tatsächliche Streamüberlast. `work/overlap-routing.test.ts`
registriert beide Werte über echte Fake-Serverrequests samt Nativeantworten. Workroster,
Legacyprojektion, Event, Tail und Kill zeigen `***`; dieselben Werte als IDs bleiben exakt.
Die unveränderten **45** externen Redactionkontrollen bleiben grün.

## R2-M1: Gemeinsame Reihenfolge bestätigter Prozessbelege

`background-state.ts` vergibt pro Sessionrecord eine gemeinsame Startgeneration für
Lifecycle- und Workrosterreads. Erst ein erfolgreich geprüfter Read übernimmt seine
Generation. Ein älterer Abschluss verändert weder `backgroundProtected` noch
`backgroundActive`, sobald ein neuerer gültiger Read übernommen wurde. Fehlerhafte
oder durch Bindungsprüfungen verworfene Reads verdrängen keine gültige Beobachtung.
Die bestehenden Epoche-/Live-ID-/Transport- und Workkontextprüfungen bleiben wirksam.

Belege: unverändertes `lifecycle-order.mts` **2/2** Gruppen grün. Nach neuerem
Running-Roster bleibt der positive Beleg trotz verspäteter leerer Antwort bestehen;
Flagoff hält Record und tatsächlichen Fake-Upstreamsocket. Der Vergleich ohne neuen
Prozess gibt beide frei. Neues `work/observation-order.test.ts` prüft außerdem die
Gegenrichtung, alten positiven Lifecyclebeleg nach jüngerem Leerroster, sowie alten
Workread nach jüngerem positiven Lifecyclebeleg. Erst frisches Settlement gibt die
gehaltenen Ressourcen frei. Keine Stop-/Killaktion oder dauerhaftes blindes Halten.
Die unveränderten **14** externen Lifecyclekontrollen bleiben grün.

## R2-L1: Queuecoverage nach Maskenwachstum und finaler Projektion

Der Queuekopf nutzt weiterhin allein `session.activate.queued.user` aus dem vorhandenen
Writable-Reply. `workTextResult()` und der finale `redactWorkRoster()` übernehmen das
Kürzungsmerkmal des tatsächlich maskierten Inhalts. Der finale Sendepfad berücksichtigt
auch später hinzugekommene Secretkenntnis und verändert die Eingabecoverage nicht.
Gewünschtes Maskieren allein zählt nicht als Kürzung; eine schrumpfende Maske darf das
harmlose Ende erhalten und ungekürzte Coverage melden. Queuebudget: 200000 Zeichen.

Belege: unverändertes `queue-output-controls.mts` **12/12** Gruppen grün, einschließlich
zehn nativer Queue-/UTF8-Vergleiche. 70000 einstellige Secrets plus harmloses Ende ergeben
nach Maskierung mehr als 200000 Zeichen: Ausgabe genau 200000, `truncated=true`.
Der schrumpfende Vergleich erhält sein Ende und meldet `false`. Neues
`work/queue-redaction.test.ts` prüft exakt/über Budget, erst finale Secretkenntnis und
schrumpfende Maskierung bei ursprünglich mehr als 200000 nativen Zeichen.

## Unveränderte Kontrollen und Pflichtchecks

- **543/543 Hermes-Tests**, 59 Dateien, `--cache=false`: alle bisherigen 517 erhalten,
  dazu **26** neue Regressionen in vier Dateien. Composer-/Organization-/Work-Contracts
  unverändert **9/9**, drei Dateien. Die angepasste Socket-Testhilfe separat erneut grün.
- **366/366** externe gesunde Altgruppen: Phase 6 R1/R2/R3 138, frische 56, unabhängiges
  Phase-6-Gate 54, Phase 4 28, Phase-7-Verhalten 10 und Await 80. Bindungen, Owner,
  CWD, Scope-/Profil-A-B-A, HOME, Transport, Abo, Optout, Unknown und kein Retry erhalten.
- Unveränderte R1-`findings.mts` **29/29**; zusätzliche R2-Redaction/Receipt/Lifecycle
  **71/71**; die drei neuen unveränderten R2-Repros zusammen **18/18** gesunde Gruppen.
  Damit **484** externe gesunde Gruppen, ohne den folgenden alten Timeout einzurechnen.
- Unverändertes altes `lifecycle-controls.mts` weiterhin erwarteter Deadline-Exit1 an
  Zeile21. Der hydrateWork=false-Zweig verlangt vor seiner gesunden Schlussassertion
  die inzwischen korrekt verhinderte Entsorgung. Kein PASS behauptet. Root bestätigte
  diese Skriptgrenze; neue und externe gesunde Gegenfälle prüfen Haltung und Freigabe.
- Sechs alte Bugrepros unverändert ausgeführt: beide History-R2 Exit0; drei historische
  R1-Bugassertionen Exit1; home-fs-boundary Exit1 an seiner unbedingten Datei-Vorassertion.
  Diese vier Exit1 sind keine gesunden Sollkontrollen und werden nicht grün gezählt.
- Isolierter Contractsbuild, Servertypen und volles `pnpm typecheck` einschließlich
  Web/E2E grün. Scope-ESLint mit `--max-warnings=0` und `architecture:file-lines` grün.
  Zwischenzeitlich blockierte allein eine fremde generierte UX-Reviewfixture die
  Architekturprüfung; nach deren Entfernung durch ihren Eigentümer erneut grün.
  Neun geänderte/neue Backenddateien, maximal150 Zeilen. Keine Baseline erhöht.

Befehle, Exitcodes und Fallausgaben:
`temp/hermes-v2/phase7-backend-fixes-r2/verify.py`, `*-results.json` und einzelne Logs.
Gruppen: `suite`, `static`, `controls`, `fresh`, `phase4`, `work-controls`, `originals`,
`r2`, `r2-healthy`. Eigene Kopien aller ausgeführten Reviewer-/Altskripte sind
byteidentisch; Ergebnisse und TMPDIR bleiben im eigenen Tempbaum.

## Freeze und Grenzen

`temp/hermes-v2/phase7-backend-fixes-r2/code-freeze.json`: **167/167** Quellen.
SHA256 der Manifestdatei:
`277300a0180d97a360f3bfe355e06832b7ea522f66273d4c3d7f06b1c439817e`.
`freeze-check.json`: **682** geschützte Artefakte unverändert, **204** byteidentische
Skriptkopien. Alte Tests, Contracts und Backendberichte unverändert. Root-Dokumentation
und parallele UI-Arbeit bleiben außerhalb dieses Quellenfreezes. Keine APIänderung.

Konservatives Maskieren harmloser passender Secretpräfixe und begrenzte partielle
Workabdeckung bleiben bekannte Grenzen. Die Reihenfolge ist eine lokale Beobachtung,
kein atomarer externer Core-CAS. Keine zusätzlichen Garantien erfunden.
Keine realen Core-/CLI-/Nutzerdaten-/Dienst-/Git-/Browser-/Preview-/Accountaktionen,
keine weiteren Agents. Eigene Fakes/Sockets/temporäre Daten geschlossen beziehungsweise
entfernt. Versionierung und Changelog verbleiben gemäß Rootauftrag beim Root.
**Produktcode bleibt bis zum frischen unabhängigen Gate unverändert.**
