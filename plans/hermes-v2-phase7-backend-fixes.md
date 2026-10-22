# Phase 7 Backend: gezielte Gatekorrekturen

Stand: 17.10.2026. Ausschließlich H1, M1, M2 und L1 aus dem vollständig gelesenen
unabhängigen Phase-7-Backendgate. Keine Phase 8 und kein selbst erteiltes Gate-PASS.
Öffentliche Contracts, Queryoptin, Operationsnamen und Legacyframes bleiben kompatibel.

## Reproduktion

findings.mts und lifecycle-controls.mts vor dem Fix unverändert bestätigt.
Die Skripte samt Fixture wurden byteidentisch in den eigenen Tempordner kopiert,
damit ihre generierten Resultdateien keine fremden Reviewartefakte überschreiben.
findings zeigte die Secretpräfixe, wieder laufende abgeschlossene Aufgaben und das
fehlende Queuekürzungsmerkmal. Der Lifecyclefall bestätigte frühzeitige Entsorgung
des eigenen Snapshots mit laufendem Prozess ohne vorangegangenes work.read.

## H1: Redaction vor Grenzen und spätere Bekanntgabe

SecretRedactor.boundedText maskiert vollständige bekannte Werte vor Zeichen-/Bytegrenzen.
Danach schützt es konservativ auch ein verbleibendes Suffix, das einem bekannten
Secretpräfix entspricht. Damit bleiben bereits gekürzte beziehungsweise erst später
als geheim bekannt gewordene Werte im finalen Sendepfad geschützt. Die bestehende
allgemeine text-/Streamredaction bleibt erhalten; keine Routing-ID wird maskiert.

Native Goal-/Model-/Fehler-/Command-/Tool-/Outputfelder werden schon bei der
Worknormalisierung mit der laufenden Registry verarbeitet. Tail, Kill, Nebenaufgaben
und Queue verwenden denselben Schutz. Die finale Workredaction prüft erneut, weil
zwischen Nativeprojektion und Browserausgabe ein weiteres Secret bekannt werden kann.
Auch die parallel erhaltenen Legacy-Subagent-/Backgroundprojektionen sichern diese
Anzeigegrenzen. Keine pauschale Objektscrubfunktion auf Identitäten angewandt.

Neue Regressionen führen echte Fake-Roster, Nativeaktionen und Events durch den Manager.
Sie prüfen Goal, Modell, Delegationsfehler, Command, Prozessoutput, Tail/Kill, UTF-8,
späte Secretregistrierung im echten folgenden FS-Await und später gelesene Cachefragmente.
Legacyevent und neue Workkarte bleiben maskiert; Routingkennungen bleiben exakt.

## M1: Settlement offener Receipts

Neues kleines work/receipts.ts hält pro tatsächlich offenem Start-RPC konkrete
Completionkennungen getrennt vom sichtbaren 100er-Roster. Der Marker existiert vor
dem nativen Send und wird auch bei Fehlern im finally freigegeben. Kind und ID bleiben
getrennt. Anzahl offener Marker und Kennungen pro Marker sind jeweils durch das
vorhandene maxPending begrenzt. Es entsteht keine unbegrenzte Aufgabenhistorie.

Ein späteres Receipt konsultiert diesen Beleg beziehungsweise die noch sichtbare
konkrete Completion. Nach 100/130 anderen Completions bleibt die eigene Aufgabe
completed; ein verlorener Text kann null bleiben. Sind beide begrenzten Evidenzen
erschöpft, entsteht unknown und konservative Haltung statt eines erfundenen running.
Kein Wiederholungsversuch und keine neue native Mutation.

## M2 und L1

Der gültige Snapshot-/Lifecycle-Roster setzt einen eigenen flüchtigen
backgroundProtected-Beleg am Sessionrecord. Er bleibt über zwischenzeitliches
backgroundActive=null hinweg bestehen und wird erst von einem gültigen frischen
nativen Abgleich ohne laufende Kinder/Prozesse aufgehoben. retainRuntime verwendet
diesen tatsächlichen Beleg unabhängig vom UI-Marker observed/work.read.

Die neue gesunde Regression erstellt tatsächlich eine eigene V2-Session, liest
anschließend regulär ihren Subscribe-Snapshot mit laufendem Prozess und deaktiviert
die letzte Verbindung ohne work.read. Records und echter Fake-Upstreamsocket bleiben
erhalten. Erst explizit angestoßener frischer Prozesssettlementabgleich gibt sie frei.

Der native Queuekopf setzt bei mehr als200000 Zeichen coverage.truncated=true.
Genau200000 Zeichen bleiben ungekürzt. Quelle bleibt derselbe Activate-Reply;
keine weitere Queueengine oder Übernahme einer Submitquittung.

## Checks und unveränderte Repros

Eigene Protokolle, byteidentische Reprokopien und Runner ausschließlich unter
temp/hermes-v2/phase7-backend-fixes/.

- Neue dauerhafte Regressionen: **21/21** grün in drei neuen Dateien.
- Gesamte Hermes-Suite: **517/517**, alle bisherigen496 erhalten.
- Composer-/Organization-/Work-Contracts: **9/9** unverändert grün.
- **366/366** unveränderte gesunde externe Kontrollen grün: bisherige248,
  Phase-4-Gruppen28 sowie Phase-7-Verhalten10 und Awaitgruppen80.
- Unverändertes findings.mts jetzt **29/29 gesunde Sollgruppen grün**, einschließlich
  aller zuvor scheiternden H1-/M1-/L1-Fälle und ihrer gesunden Vergleichsvarianten.
- Das unveränderte lifecycle-controls.mts endet nach dem Fix erwartbar mit seinem
  eigenen Deadlinefehler: Zeile21 verlangt im hydrateWork=false-Zweig vorzeitige
  records.size===0 samt Socketclose, bevor die spätere gesunde Sollassertion erreicht
  wird. Korrekte Haltung verhindert genau das. Root hat diesen Widerspruch unabhängig
  bestätigt und die dokumentierte Ausnahme freigegeben. Keine Fremdassertion geändert
  und dieser Exit1 wird nicht als grün gezählt. Der neue gesunde Snapshotfall oben
  prüft zusätzlich tatsächliches späteres Settlement und Socketfreigabe.
- Expliziter Server-Typecheck, isolierter Contractsbuild und Gesamt-Typecheck
  einschließlich Web/E2E abschließend grün. ScopeLint mit max-warnings=0 sowie
  architecture:file-lines ebenfalls grün.
- Alle neuen und geänderten Handdateien unter400 Zeilen. Keine Baseline erhöht.

## Scope, Grenzen und Freeze

Keine Contract-, Client-, UI-, Root-E2E-, Versions- oder Configänderung. Alte Tests,
fremde Reproquellen und frühere Berichte bleiben unverändert. Die Änderungen betreffen
die vorhandenen Work-/Redaction-/Lifecyclepfade, plus drei neue Regressionstestdateien
und den kleinen begrenzten Receiptbelegspeicher.

Konservativer Secretpräfixschutz kann auch harmlose passende Textenden maskieren.
Eine Quittung nach vollständigem Evidenzverlust bleibt unknown. Native Fehlerdelegationen
und Nebenaufgaben behalten ihre bekannte Teilabdeckung. Akzeptierte externe Core-CAS-,
Dateisnapshot-, Vision-/PDF- und HOME-Attestationsgrenzen bleiben unverändert.

Produktcode und Tests ausdrücklich eingefroren. SHA-256 aller163 Backend-/Contractquellen
in temp/hermes-v2/phase7-backend-fixes/code-freeze.json. Weitere Änderungen ausschließlich
nach neuer konkreter Rootfreigabe. Keine echten Core-/CLI-/Dienst-/Browser-/Preview-/Git-/
Account- oder Nutzerdatenaktionen, keine weiteren Agents. Nur eigene Fakes und temporäre
Dateien/SQLite/Loopbacks. Versionspflege verbleibt beim Root-Orchestrator.
Nach der Ergebnisübergabe Stop für unabhängiges R2, keine Folgephase.
