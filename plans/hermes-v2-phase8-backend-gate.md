# Hermes V2 Phase 8: unabhängiges Backend-/Contracts-Gate

Stand 17.10.2026. **Verdikt: needs fixes für den eingefrorenen Backend-/Contractscope.**
**Offen: H1 High, M1 Medium, M2 Medium. Separat L1 Low.**
Keine Produktkorrektur vorgenommen. Keine Client-, UI-, Gesamtfeature-, Phase-9-
oder Freigabe echter Mutationen. Root wurde bei jedem High-/Medium-Nachweis informiert.

## Grundlage und Verfahren

Originalbrief, AGENTS.md, sprachstil, Sicherheitsreviewregeln, vollständige Phase-8-
Implementierungs-/Interfacedokumente und Feature-API-Handoff gelesen. Phase-7-Gates
R1 bis R5 samt sämtlichen Fixantworten vollständig abgeglichen, ebenso Phase-6-
Freshgate und referenzierte Phase-2-/4-Send-, Secret-, Runtime- und Organisationsgrenzen.
Installierte Cron-/Skills-/Pending-/Deletequellen ausschließlich statisch geprüft.
Native Deletekaskade umfasst Kompressionskette und rekursive Delegatekinder;
Branch/Reset bleibt unabhängig. Ein natives ok allein beweist keine Abwesenheit.

Eigene Artefakte ausschließlich unter
`temp/hermes-v2/phase8-backend-review-20261017/`, nachfolgend Reviewtemp.
Echte registrierte Fastifyrouten, ResourceHost, Projektion und finaler HTTPbody;
vorhandene isolierte FakeGateway-/Ressourcenfixture mit eigener SQLite verwendet.
Eigene FS-Barrieren halten tatsächlich erhaltene lstat-Ergebnisse. Kein Produktguard,
keine Secretregistry und kein MutationOutcome zur Erzeugung eines Befundes ersetzt.
Secretkenntnis stammt in den eigenen Redactionfällen aus echten request.respond-
Operationen mit belegten Nativeantworten. Ausschließlich synthetische Zugangswerte.

## H1, High: dynamische Maskierung zerstört die Credentialklassifikation

Fundstellen relativ zu `apps/server/src/hermes/v2/`:
`resources/projection.ts:7`, `:8`, `:11`; `normalize-values.ts:10`;
nachgelagert `../redaction.ts:10`, `:29`. Aufrufer: Knowledge-Payloads und Memorytext.

`resourceText` maskiert zuerst den gesamten serialisierten Rawtext. Ein bekanntes
kurzes Secret verändert dabei JSON-Feldnamen, bevor die statische Redaction die
ursprünglich sensiblen Schlüssel erkennen kann. Die finale Projektion bekommt
bereits veränderte Schlüssel und kann den verlorenen Nachweis nicht zurückholen.

Repro `credential-controls.mts`: regulär abonnierte Fake-Session, Secretrequest,
request.respond für `cred`, `entials` oder `credential`, tatsächliche Nativeantwort.
Danach echte Pendingdatei mit gültiger nativer Hülle und verschachteltem
credentials-Objekt lesen. **Ist: dessen vollständiger unbekannter Zugangswert
steht unmaskiert im HTTP200-Body.** JSON-Memorytext bestätigt denselben Pfad.
Bekannte Werte `pass` beziehungsweise `word` lassen den ursprünglichen password-
Wert vollständig erscheinen. Kein Crop, übergroßer Inhalt oder freier Browserpfad nötig.

Zwölf Gruppen: zwei gesunde Vergleiche ohne diese Secretkenntnis maskieren korrekt;
zehn gesunde Geheimhaltungsassertionen scheitern, Skript Exit1. Je negativem Fall
genau eine echte Secretantwort. `credential-observations.json` dokumentiert
Credential-/Passwortleck als Booleans, ohne echte Zugangswerte.

Auswirkung: Die zusätzliche Kenntnis eines harmlosen kurzen Secrets schwächt die
strukturelle Geheimhaltung anderer Werte. Fixrichtung: sensible Schlüssel/Strukturen
am unveränderten Eingang klassifizieren und deren Schutz mit den ebenfalls am
Rawtext erkannten bekannten Secretintervallen erhalten. Kein bloßes Umsortieren,
das seinerseits vollständige Langwert-/Präfixnachweise vor der Maskierung zerstört.
Raw-/JSON-Überlappung, Redaction vor Crop und finale Nachprüfung beibehalten.

## M1, Medium: beobachteter HOME-Inodewechsel entwertet alte Scopes nicht dauerhaft

Fundstellen: `resources/context.ts:35`, `:36`, `:39`, `:45`;
`resources/host.ts:39`. Die HOMEgeneration wird nur beim erfolgreichen neuen
Kontextcapture beobachtet. Der bestehende Kontext verwirft einen fremden Inode,
schreibt diesen tatsächlich beobachteten Verlust aber nicht in die Generation.

Repro `home-aba-controls.mts`, echte HTTPfolge mit eigenem Verzeichnis:
Scope A lesen. Während des nativen Cronreads A umbenennen und unter derselben
Schreibweise ein neues Verzeichnis B anlegen. Der echte Guard erkennt B und liefert
409/STALE_RESOURCE_CONTEXT ohne Inhalte. Danach Originalinode A zurückhängen und
mit dem alten Scope Pause anfordern. **Ist: HTTP200/confirmed und ein nativer Send.**
**Soll: alter Scope bleibt gesperrt, 409/not_sent und null Sends.**

Gesunde Gegenrichtungen: unverändertes A erlaubt einen Send; ein neuer vollständiger
Kontextread bei B entwertet A korrekt und sperrt nach Rückkehr den alten Scope.
Drei Gruppen, zwei gesund, eine Sollassertion scheitert, Exit1. Einzelwerte in
`home-aba-observations.json`. Dies ist ein beobachtetes lokales A-B-A, kein Anspruch
auf atomaren externen Core-CAS. Fix: jeder tatsächlich erkannte HOMEverlust oder
Identitätswechsel muss die monotone HOMEgeneration vor der Fehlerausgabe entwerten.
Ein frischer Read samt bewusster Bestätigung muss anschließend erforderlich bleiben.

## M2, Medium: Deletecleanup entfernt neue hydrierende Leases und Arbeitsbelege

Fundstellen: `resources/session-delete.ts:64`, `:65`, `:66`, `:67`;
Aufruf `resources/routes.ts:94`. Der finale Cleanup prüft alte Snapshotzustände,
übersieht aber hydrating und gepufferte neuere Events. Die Vorsendprüfung localIdle
ist an dieser Stelle strenger und kann den späteren Zustand nicht garantieren.

Repro `delete-hydration-controls.mts`: volle ID, gültige Vorschau, bestehende sichere
Idlebindung, echte DELETEroute und ein nativer Deletesend. Danach im echten frischen
Profilawait einen neuen regulären session.subscribe starten. Dessen wirklichen
Detailread halten, während record.hydrating=true ist. Optional zusätzlich echtes
message.start empfangen: nativeRunning=true, ein Event im regulären Snapshotpuffer.
Postread bestätigt requestedID als abwesend; der normale finale Cleanup läuft.

**Ist: HTTP200, Record gelöscht, Subscriber/Lease entfernt, obwohl der neue Snapshot
noch läuft. Auch der bereits empfangene neue Arbeitsstart wird so verworfen.**
Gesunde Sollassertion: diese jüngeren Belege erhalten. Beide Varianten scheitern.
Gegenrichtungen: weiterhin idle wird korrekt bereinigt; neuer message.start ohne
Hydrierung bleibt korrekt erhalten. Vier Gruppen, zwei gesund, zwei Sollfehler,
Exit1. `delete-hydration-observations.json` belegt Status, Hydrierung, Puffer und Haltung.
Keine Behauptung eines realen Corekills. Fix: Cleanup nur mit weiter gültigem lokalen
Inaktivitätsbeleg und passender Record-/Bindungsgeneration, hydrierende/queued/
gepufferte oder inzwischen geschützte Zustände erhalten. Keine Stop-/Killumgehung.

## L1, Low: tatsächlich unlesbare Datei wird als unknown ausgegeben

Fundstellen: `resources/files.ts:31`, `:33`, `:55`.
Echte temporäre MEMORY.md mit Modus000: lstat gelingt, open scheitert an EACCES.
Weil started bereits true ist, folgt status=unknown statt unreadable. Text bleibt
korrekt null. Vergleichsfälle missing, empty und Symlink/unknown bestehen.
`boundary-controls.mts`: diese eine Statusassertion scheitert. Keine Datenfreigabe.
Fix: sichere Berechtigungs-/Lesefehler von Identitäts-/Austauschunsicherheit trennen,
ohne Symlinks oder verschwundene Dateien als sicher lesbar auszuweisen.

## Unabhängige Kontrollen und Pflichtchecks

- **702/702 Hermesfälle**,75 Dateien, cache=false. **23/23 Contracts**,vier Dateien.
  Alle bisherigen612+90 beziehungsweise9+14 Fälle selbst wiederholt, jeweils Exit0.
- **234/234 unveränderte R5-Gruppen**: Metadaten8, Budget27, R5-Verhalten53,
  Präfix48, Settlement8, Await80, Verhalten10.68 ausführbare TS-/Fixturekopien
  byteidentisch; eigener Runner angepasst, fremde Assertions unverändert.
- Eigene **71 gesunde Sollgruppen**:57 bestehen,14 scheitern an den vier Befunden.
  H1 zehn, M1 eine, M2 zwei, L1 eine. Kein negativer Gesamtlauf als PASS gezählt.
- Eigene18/18 Redaction-/Budgetgruppen: überlappende Kurz-/Langwerte an Präfix,
  Mitte/Suffix, beide Reihenfolgen, echte späte Nativeantworten nach wirklichem
  post-Native-lstat, alte Memory-/Pendingprojektionen unverändert, reale finale
  HTTPantwort unter1MiB bei früher/später tatsächlicher Maskenexpansion.
- Eigene25/26 Boundarygruppen: Auth/Origin/off vor jedem Read, no-store,
  native409/rejected, Teilannahme+409/unknown, falsche Zwischen-ID, Netzwerkverlust,
  nachsend Profilwechsel, CWDrebind/null Sends. Fehlgeschlagen ausschließlich L1.
- Eigene8/8 Readergruppen über echten eigenen Loopback-HTTPserver: streamende
  Übergröße ohne Content-Length und deklarierte Übergröße, Cancel/Abort/Deadline,
  chunkgetrenntes UTF8 einschließlich echtem U+FFFD, null arrayBuffer-Aufrufe,
  genau einmaliger401-Refresh, null Retry nach defekter/abgebrochener Mutation.
- Isolierter Contractsbuild:19 Hermes-Runtime-JS-Dateien bytegleich zum tatsächlich
  importierten Package-dist. Servertypen, Scope-ESLint max-warnings=0 und
  architecture:file-lines jeweils Exit0. Abschließendes volles pnpm typecheck
  einschließlich Web/E2E ebenfalls Exit0. Der erste Lauf war ausschließlich durch
  parallele CronArea-/CronForm-/Ressourcenfixture-Webtypen blockiert, kein Backendfund.

Befehle/Exitcodes: Reviewtemp/verify.py, verify-own.py, r5-controls/verify.py,
*-result.json, own-exits.json und Einzelprotokolle. Vier eigene Befundskripte Exit1,
zwei eigene gesunde Skripte Exit0. Bekannte widersprüchliche alte Lifecycle-/negative
Bugassertionen nicht neu ausgeführt und ausdrücklich nicht als PASS übernommen.
Eigene Anfangsfehler: zu langer tsx-IPC-Socketpfad, danach Node-TSX-Loader verwendet;
erste Secretfixture ohne Storedbeleg korrigiert. Keine Produktguards abgeschwächt.

## Freeze, Scope und Abschluss

Autorenmanifest-SHA256 unverändert:
`fc080a320ae04b2025e0f554957636c4fd18a7ff35411a18c7463445b37e51e8`.
Vorher/nachher209/209 Quellen,74/74 alte Tests/Fixtures und1539/1539 geschützte
Altartefakte identisch; eigene gemeinsame Anfangsbaseline1748/1748 unverändert.
Abschlussdatei Reviewtemp/freeze-final.json. Keine alte Assertion, Fremdquelle oder
Altberichtänderung. Dieser Bericht unter200 Zeilen, eigene Handdateien unter400.

Parallele Web-/Alpha-/NativeClientarbeit bleibt außerhalb dieses Gates; ihre
Typfehler und M1/L1 werden weder behoben noch als Backendfinding umgedeutet.
Version und Changelog bleiben Root. Keine UI-/Browserprüfung oder Gesamtfreigabe.
Alle eigenen Fakes/Sockets/Timer/Dateihandles/SQLite geschlossen, FS-Hooks restauriert,
Fallordner entfernt. Keine echten Core-/CLI-/Dienst-/Preview-/Slot-/Account-/Gitaktionen,
keine weiteren Agents. Akzeptierte externe Core-CAS-/Dateisnapshot-/HOME-Attestations-
und partielle Workcoveragegrenzen bleiben bestehen. Die drei Blocker verlangen keine
dieser zusätzlichen Garantien. **Vor Backend-PASS H1, M1 und M2 beheben und neu prüfen.**
