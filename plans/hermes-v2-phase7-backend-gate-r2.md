# Hermes V2 Phase 7: unabhängiges Backend-/Contracts-Gate R2

Stand: 17.10.2026. **Verdikt: needs fixes ausschließlich für Backend R2.**
**Offen: R2-H1 High, R2-M1 Medium, R2-L1 Low.** Keine Produktkorrektur vorgenommen.
Keine Phase-8-, UI-, Client-, Browser-, Realruntime- oder Gesamtfreigabe.

## Grundlage und Verfahren

Originalauftrag, R1-Befunde, Autorenantwort und verbindlichen Phase-7-Vertrag gegen
die Quellen geprüft. Die abschließenden Phase-2-/4-/6-Gates und die tatsächlich
betroffenen älteren Secret-/Lifecyclegrenzen abgeglichen. Frühere PASS-Aussagen
ersetzen keine Gegenfälle. AGENTS und sprachstil gelesen und angewandt.
Eigene Fakes, SQLite, Dateien, Kontrollen und Logs ausschließlich unter
`temp/hermes-v2/phase7-backend-gate-r2-20261017/`, unten kurz R2-Temp.
Die etablierte FakeGateway-Klasse dient als isolierte Loopbackgegenstelle.

Fremde ausführbare Kontrollen byteidentisch in einen eigenen Verzeichnisbaum
kopiert. Relative Produktimporte führen über Lesesymlinks zum aktuellen Checkout;
Assertions bleiben exakt erhalten. Generierte Ergebnisse überschreiben dadurch
keine fremden Artefakte. TMPDIR liegt für alle Testprozesse im eigenen R2-Temp.

## R2-H1, High: überlappende bekannte Secrets werden abhängig von ihrer Reihenfolge verraten

Quellen relativ zu `apps/server/src/hermes/v2/`: `secret-redactor.ts:43`, `:53`;
Aufrufer `work/normalize.ts:8`, `work/redact.ts:11`, `redact-browser.ts:24`.
`text` ersetzt registrierte Werte nacheinander am bereits veränderten Text.
Ein zuerst registrierter kurzer Teilwert zerstört den vollständigen Treffer des
später registrierten langen Werts. `boundedText` übernimmt diesen Zwischenstand;
sein Suffixschutz kann das bereits teilweise ersetzte Secret nicht rekonstruieren.

Repro: `overlapping-secrets.mts`. Je Fall zwei reguläre Fake-Serverrequests mit
`request.respond`, tatsächlich zwei Nativeantworten, keine Registrymanipulation.
Zuerst einen zweistelligen Teilwert, danach das vollständige 28-stellige Dummysecret
registrieren. Präfix- und Suffixvariante getrennt prüfen. Native Goal, Modell und
Prozesscommand sowie echtes subagent.start passieren Manager und finalen Sendepfad.
**Ist: mindestens 24 zusammenhängende Zeichen des bekannten langen Werts erscheinen
in allen drei Workfeldern, Workevent und Legacy-Subagentprojektion.** IDs bleiben exakt.
Normale kurze Felder, kein übergroßer Coreoutput und kein Timingangriff erforderlich.

Gesunde Sollassertion: kein solcher unmaskierter Bestandteil eines vollständig
bekannten Werts in den Anzeigefeldern, unabhängig von Registrierungsreihenfolge.
Gesunder Vergleich: langer Wert zuerst, kurzer danach, beide Varianten sicher.
Zwei gesunde Vergleiche bestehen; beide negativen Sollgruppen scheitern, Skript Exit1.
Die Ursache liegt im gemeinsam genutzten Redactor; keine Behauptung, dass die
sequentielle Ersetzung erst durch diesen Fix neu eingeführt wurde.

Auswirkung: fast vollständiger bekannter Zugangswert erreicht erneut den Browser.
Fixrichtung: vollständige und überlappende Treffer am unveränderten Eingang sicher
maskieren, ohne dass eine frühere Ersetzung spätere Secretkenntnis entwertet.
Raw-/Escapingvarianten, Bounds, Streamschutz und exakte Routingkennungen erhalten.

## R2-M1, Medium: ältere Lifecycleantwort löscht neueren positiven Prozessbeleg

Quellen: `background-state.ts:21`, `:29`, `:30`, `:31`;
`work/service.ts:80`, `manager.ts:93`, `pool.ts:80`, jeweils im selben V2-Verzeichnis.
Lifecycle prüft Epoche, Live-ID und Transport, aber keine Reihenfolge gegenüber
einem inzwischen abgeschlossenen Workread derselben Bindung.

Repro: `lifecycle-order.mts`. Tatsächliche session.create, danach Subscribe mit
eigenem laufendem Prozess, zunächst ohne work.read. Alten Prozess im Fake settlen;
message.complete stößt einen regulären Lifecycleabgleich an. Dessen echte leere
process.list-Antwort am Fake-Socket halten. Neuen Prozess starten und work.read
vollständig abschließen: neue Prozess-ID, running und backgroundProtected=true.
Erst danach die ältere leere Antwort freigeben und ihren Abschluss abwarten.
Der zusätzliche Aufruf von refreshBackground tritt lediglich dem bereits offenen,
coalesced Promise bei; keine Produktfunktion oder Antwort wird ersetzt.

**Ist: backgroundProtected=false und backgroundActive=false. Flagoff entfernt
Managerrecords und schließt den echten Fake-Upstreamsocket, obwohl der frische
eigene Prozess weiter im nativen Fake-Roster läuft.** Ein work.read hatte seinen
positiven Beleg bereits erfolgreich an den Browser ausgegeben.
Gesunde Sollassertion: Record und Socket bis gültigem neuerem Settlement erhalten.
Gesunder Vergleich ohne neuen Prozess: dieselbe leere Antwort gibt beides korrekt frei.
Kontrollgruppe besteht, negative Sollgruppe scheitert, Skript Exit1.

Auswirkung ist belegter vorzeitiger Schutz-/Beobachtungsverlust. Kein realer Kill
oder Orphan-Reaper-Lauf behauptet. Fixrichtung: Lifecycle- und Workbeobachtungen
gemeinsam ordnen; ältere Antworten dürfen neuere positive Belege nicht löschen.
Bei überholtem Abgleich konservativ halten und nur gültiges frisches Settlement
übernehmen. Kein blindes dauerhaftes Halten nach klar belegter Abwesenheit.

## R2-L1, Low: Queuekürzung durch Maskenwachstum bleibt ohne Abdeckungsmerkmal

Quellen: `secret-redactor.ts:45`, `:53`, `work/service.ts:84`, `:86` und
`work/redact.ts:18`. Der gemeinsame Redactor begrenzt Maskenwachstum schon auf
die ursprüngliche Eingabelänge. Queuecoverage prüft lediglich native Länge>200000.

Repro: `queue-output-controls.mts`. Einstelliges Dummysecret über echten
Serverrequest und echte Response registrieren. Natives Activatequeued.user enthält
70000 Wiederholungen plus 14 Zeichen harmloses Ende, insgesamt 70014 Zeichen.
**Ist: Ausgabe 70014 Zeichen, harmloses Ende verloren, coverage.truncated=false.**
Das ungekürzte maskierte Ergebnis hätte 210014 Zeichen und überschritte das Queuebudget.
Es handelt sich um tatsächlichen Inhaltsverlust zusätzlich zur gewünschten Maskierung.
Gesunde Sollassertion: verlorener maskierter Queueinhalt setzt truncated=true.
Vergleich mit längerem Secret schrumpft, behält das Ende und bleibt ehrlich ungekürzt.
Zehn reine Queue-/UTF8-Kontrollen bestehen; Vergleich besteht, negative Sollgruppe
scheitert. Gesamtskript Exit1, kein gesunder Gesamtlauf behauptet.

Fixrichtung: Begrenzung nach Redaction einschließlich Maskenexpansion und finaler
Projektion nachweisbar erfassen und in dasselbe Abdeckungsmerkmal übernehmen.
Native Queuequelle, genaue Grenze und alleinigen nächsten Kopf erhalten.

## R1-Korrekturen und eigene gesunde Gegenfälle

- Ursprüngliche H1-Kürzungsfälle bestehen. Eigene `redaction-controls.mts`:
  **45/45** Gruppen, echte Secretantworten für ASCII, Escaping, Mehrbyte und kurze
  Werte, Goal/Modell/Tool/Fehler/Command/Output, exakte IDs auch bei gleichem Secret,
  Legacy-/Workfanout, sämtliche Chunktrennstellen und sechs echte nachgelagerte
  FS-Awaits mit erst dort per Request/Response bekanntem Wert. Alte Cachefragmente
  werden final maskiert. Harmloses passendes Einzeichensuffix wird ebenfalls maskiert;
  dieser konservative False Positive ist ausdrücklich bestätigt. R2-H1 bleibt offen.
- R1-M1 geschlossen im geprüften Receipt-Scope. `receipt-controls.mts`: **12/12**
  Gruppen, Marker bereits beim tatsächlichen Nativeaufruf reserviert, Completion vor
  Receipt nach 131 anderen Abschlüssen weiterhin terminal; voller Belegverlust ergibt
  unknown und Haltung. Zwei echte parallele RPCs verschiedener Sessions, gleiche ID
  und verschiedene kinds bleiben getrennt. Hauptturn wird nicht als fertig markiert;
  Unknown darf ihn unbekannt setzen. Flag/Scope-A-B-A/Profilverlust/Abo/Optout/Transport
  räumen Marker im finally auf. maxPending begrenzt Marker und IDs; End/Clear idempotent.
  Begrenzungsprobe direkt am Tracker ergänzt echte RPC-Fälle, ersetzt sie nicht.
- Ursprünglicher R1-M2-Snapshotfall korrigiert. `lifecycle-healthy.mts`: **14/14**,
  echte Create-/Subscribe-Pfade ohne und mit work.read, zwischenzeitlich active=null,
  Profil-/Scope-A-B-A, expliziter Profilverlust und tatsächlich nur lesbarer Snapshot
  wegen ungültigem nativem CWD halten Record und Socket. Erst frischer leerer Abgleich
  gibt frei. Eigene Background/Btw bis Completion und eigene/fremde Idlebindungen
  als Gegenrichtungen geprüft. Keine Stop-/Killaktion. R2-M1 bleibt offen.
- Ursprünglicher R1-L1-Fall korrigiert. Je exakt 200000/200001 Zeichen für ASCII,
  Umlaute und Emoji geprüft, Kopf ausschließlich Activatequeued.user. Queue-ACK und
  rejected-Steer ersetzen ihn nicht. Background/Btw bei exakt 16384 UTF8-Bytes und
  darüber halten Bytebudget und Kürzungsmerkmal. R2-L1 bleibt offen.

## Unveränderte Regressionen und Pflichtchecks

- **517/517 Hermes-Tests**, 55 Dateien, mit --cache=false; alle 496 bisherigen plus 21
  Autorregressionen. Composer-/Organization-/Work-Contracts **9/9**, drei Dateien.
- **366/366** externe gesunde Altgruppen selbst wiederholt: Phase 6 R1/R2/R3 138,
  frische 56, jüngstes unabhängiges Gate 54, Phase 4 28, Phase-7-Verhalten 10 und Await 80.
  Letztere prüfen alle vier Mutationen vor/nach echten FS-/RPC-Grenzen: gleiches Profil
  gültig, CWD/Scope/Profil-A-B-A/readonly/HOME/Transport/OwnerConnection/Abo/Workoptout,
  vorher not_sent/null Sends, nachher unknown/ein Send mit Haltung, kein AutoRetry.
  Frische Zielautorisierung, Nativefalse/Killstatus, coalesced Reads, Stop während
  Read/Tail, stale Roster ohne Patchrollback und echter work=1-/Legacysendpfad erhalten.
  Attachment-/SQL-/UID-/Metadaten- und Ownergrenzen bleiben in diesen Kontrollen erhalten.
- Unverändertes `findings.mts`: **29/29** gesunde Sollgruppen bestanden.
  Unverändertes `lifecycle-controls.mts`: erwarteter Deadline-Exit1 genau Zeile21,
  weil der korrigierte hydrateWork=false-Zweig vor Schlussassertion Entsorgung verlangt.
  Kein PASS und kein Regressionsbeweis; eigene 14 Lifecyclegruppen ersetzen diesen Ablauf.
- Sechs alte Bugrepros unverändert ausgeführt: beide History-R2 Exit0, drei historische
  R1-Bugassertionen Exit1. home-fs-boundary zeigt null Stage/null Dateien/not_sent;
  sein Exit1 bleibt die unbedingte Datei-Vorassertion Zeile41. Nicht gesund gezählt.
- Isolierter Contractsbuild im eigenen dist/, Servertypen und ScopeLint mit
  max-warnings=0 grün. Gesamt-pnpm-typecheck einschließlich Web/E2E grün in diesem Lauf.
  Das bestätigt keine UI-/Clientabnahme. Abschließende architecture:file-lines grün;
  Bericht unter200, alle eigenen Handdateien unter400, keine Baseline erhöht.
  Befehle, Exitcodes und Ergebnisse in verify.py, den Logs und Ergebnisdateien.

## Freeze, Grenzen und Übergabe

Vorher/nachher **163/163 Backend-/Contractfreezequellen identisch**, keine neue Quelle.
Autorenfreeze SHA256: a952d2acea37dd69d02964037a419ea4ab7dd0cb8dbfdf4d8047edabe491fd7b.
Historischer 159er-Freeze unverändert. Breite eigene Baseline 1669 Artefakte;
einzige bisherige Abweichung: paralleler Bericht phase7-ui-implementation außerhalb
des Backendfreezes. Abschließender Einzelvergleich nach diesem Bericht: freeze-final.json.
Altquellen, alte Assertions, Repros und Altberichte dieses Backendscopes unverändert.

Akzeptiert bleiben fehlender atomarer externer Core-CAS, Dateisnapshot-/Vision-/PDF-
und zusätzliche native HOME-Attestationsgarantie sowie partielle native Workabdeckung.
Die drei Befunde verlangen keine dieser Garantien. Keine rein hypothetischen Findings.
Nur neuen Bericht und eigene Temp-Artefakte geschrieben; eigene Fakes, SQLite, Sockets
und FS-Hooks geschlossen beziehungsweise zurückgesetzt, eigene Fall-/Runtimeordner entfernt.
Keine echten Core-/CLI-/Dienst-/Browser-/Preview-/Account-/Git-/Nutzerdatenaktionen,
kein produktiver Webbuild/Restart, keine weiteren Agents. Versionierungen gelesen;
Produktversion und Changelog verbleiben entsprechend Auftrag beim Root.
**Vor Backend-R2-PASS die drei belegten Findings beheben und unabhängig nachprüfen.**
