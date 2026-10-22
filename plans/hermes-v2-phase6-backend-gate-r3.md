# Hermes V2 Phase 6: unabhängiges Backend-/Contracts-Gate R3

Stand: 16.10.2026. **Verdikt: PASS ausschließlich für Phase-6-Backend und Contracts.**
M1A bleibt geschlossen. R2-M1B und R2-M2 sind geschlossen. Keine belegten offenen
High-/Medium-Befunde im vereinbarten Fix-/Regressionsscope.
Kein Client-, UI-, Browser-, Realruntime-, Phase-7- oder Gesamtfeature-PASS.

## Grundlage und Freeze

Neue unabhängige Runde am ausdrücklich eingefrorenen zweiten Fix. Der vollständige
Auftrag, Contractentwurf, Interface, Model-/Commands- und Feature-API-Handoff sowie
R1-/R2-Findings und beide Autorenantworten wurden abgeglichen. Der tatsächliche
R2-Work-Bericht ist die Grundlage; keine Arbeit einer ausgefallenen Personalrunde unterstellt.
Phase-2-Presend-R5 und Phase-4-Backend-R4 samt Antworten bleiben verbindliche Grenzen.

Selbst geprüfte Pfade: writable/Profilereignisse, Attachment-Capture/Recheck, HOME und
Stagingroots, Send/Unknown, History vor REST-Read, Managercallback, UIDpinning und
nachgelagerte Organisationsprojektion. Die neun neuen dauerhaften Regressionen wurden
gelesen und mit allen bisherigen Hermesfällen ausgeführt.
Eigene neue Gegenproben und Protokolle ausschließlich unter
`temp/hermes-v2/phase6-backend-review-r3/`.

## M1A: geschlossen erhalten

Belege relativ zu `apps/server/src/hermes/v2/`: `session-service.ts:222`,
`normalize-events.ts:56`, `attachments/binding.ts:31`.
Frische Activateantworten setzen den Profilnachweis vor dem folgenden CWD-Await.
Fehlend/null/leer/fremd wird nicht durch einen alten Defaultnachweis ersetzt.
Die unveränderten 20 unabhängigen R2-Profilgruppen bestehen einschließlich Capture,
Stage, Submit, nachnativer Unknown-Grenze, partieller Events und gesundem Defaultfall.
Zusätzlich verhindert ein echtes Fake-Core-Profilereignis während des neu hinzugefügten
letzten HOME-Awaits den Send. Null native Dateien, `not_sent`.

## R2-M1B: geschlossen

Belege: `attachments/service.ts:47`, `:53`, `attachments/scope-check.ts:7`.
Nach beiden abgeschlossenen Stagingroot-Prüfungen folgt erneut der HOME-Nachweis.
Danach prüft der synchrone Guard die ursprüngliche Connection-/Sessionbindung und Abort,
bevor `file.attach` tatsächlich gesendet wird.

`stage-await-controls.mts`: zwei eigenständige gesunde Fälle mit echten FS-Aufrufen.
Nur die Rückgabe der letzten CWD-lstat-Antwort wird gehalten, nachdem die parallele
HOME-Rootprüfung abgeschlossen ist. Bei vollständiger HOME-Umbindung auf einen eigenen
Symlink: **null file.attach, null Dateien in beiden HOME-Zielen, not_sent/not_sent**.
Ohne Umbindung: genau ein Stage, eine native Datei, `ready` im ursprünglichen Root.

Das unveränderte Original `home-fs-boundary.mts` zeigt denselben gesunden Ablehnungszustand.
Sein Exit 1 stammt ausschließlich von der unbedingten `nativeFiles.length===1`-
Vorassertion in Zeile 41. Diese Assertion blieb unangetastet; Exit 1 ist hier kein
weiter bestehender Produktfehler. Die neue eigene Gegenprobe verlangt ausdrücklich null Dateien.

`stage-final-guard-controls.mts`: acht weitere gesunde Gruppen am neu hinzugefügten
letzten HOME-Await. Unveränderte Bindung und gleiche Scope-Neubestätigung erlauben Stage.
Flagoff, Connectionrelease, reales Profil-/CWD-Event, Abort oder bestätigter anderer Scope
ergeben jeweils vor Send null Stage/Dateien und `not_sent`.
Die sechs unveränderten R2-HOME-Gruppen erhalten zudem Status-/Submit-/Downloadschutz
und Unknown nach möglicher Nativeannahme ohne Löschung der nativen Datei.

## R2-M2: geschlossen

Belege: `history-context.ts:11`, `organization/scope.ts:35`, `session-service.ts:200`,
`:205`, `:206`, `attachments/service.ts:126`, `organization/service.ts:71`.
Die Historyquelle wird vor dem REST-Read eingefroren. Dieselben Scopewerte und dieselbe
Beobachtungsrevision erreichen Karten-/UID- und Organisationsprojektion. Beide verwenden
den ursprünglichen Scope. Nach dem Attachmentcallback prüft die Sessionlesung erneut;
bei verlorenem Kontext entfernt sie bereits erzeugte Antwortkarten.
Organisation prüft vor ihrer synchronen Projektion nochmals `context.valid()`.

`history-await-controls.mts`: **42 eigene gesunde Gruppen**, jeweils direkte History und
Subscribe/Snapshot. Für beide Pfade wird getrennt die REST-Antwort sowie jede echte
HOME-realpath-/lstat-Antwort in allen drei Prüfungen gehalten: vor Attachmentcallback,
innerhalb dessen und danach vor Organisationsprojektion. Keine FS-Resultate erfunden.
An jedem der sieben Punkte: gleiche Neubestätigung, anderer bestätigter Scope und echter
beobachteter A→B→A-Wechsel bei unverändertem Profilnamen.

- Gleiche Neubestätigung: Revision unverändert, richtige Karte/UID, Zeuge im ursprünglichen
  Scope und ReadEvidence bleiben erhalten. Keine Entwertung allein durch neue Objektidentität.
- Anderer Scope/A→B→A: Revision steigt um eins/zwei. Alte Seite bleibt lesbar, ohne Karte,
  ReadEvidence oder Rowzeugen in irgendeinem Scope. Vor Kartenprojektion entsteht kein UIDpin.
- Wechsel erst nach erfolgreicher Kartenprojektion: der bereits richtige UIDpin bleibt
  ausschließlich an seiner ursprünglichen eigenen Zuordnung erhalten; keine neue falsche
  Zuordnung. Antwortkarte wird entfernt, Organisationsprojektion bleibt aus.
- Anschließender frischer Read erhält in allen Varianten die richtige Karte/UID und Evidence.

Beide unveränderten ursprünglichen History-Gegenrepros bestehen mit Exit 0.
Die sechs unveränderten R2-Profilstempel-/Historygruppen bestehen ebenfalls: fehlende,
leere oder fremde Seitenprofile sowie fremder Owner/Legacy erhalten keine Karte und
keinen falschen UIDpin. Eine schon bekannte UID ersetzt keinen passenden Profilstempel.

## Ausgeführte Checks

- **86/86 unveränderte positive Kontrollgruppen:** R1 boundary 22, HTTP/files 10,
  composer 13, store 6, runtime 3; R2 Profil 20, HOME 6, History 6.
- **52/52 eigene gesunde R3-Gruppen:** Stage-FS 2, letzter Stageguard 8, History-Awaits 42.
  Eigene Historyassertion einmal für SQLite-Objekte ohne Prototyp berichtigt; gleiche
  erwartete Scope-/UIDwerte, keine Produkt- oder fremde Assertion geändert.
- `pnpm --filter @wrapt/server exec vitest run --cache=false src/hermes`:
  **408/408 grün, 44 Dateien**. Alle bisherigen 399 plus neun neue Fälle erhalten.
- Zwei explizite Composer-/Organization-Contracttestdateien: **6/6 grün**.
- Contracts mit `tsc -p tsconfig.json --outDir <R3>/dist/contracts-build` erfolgreich gebaut.
  Vorhandenes Package-dist blieb unverändert; generierter Testbuild nur im eigenen Tempordner.
- Server-Typecheck und gezieltes ESLint für V2 plus Hermes-V2-Contracts,
  `--max-warnings=0`: grün.
- **`pnpm typecheck` vollständig grün**, einschließlich Web und E2E in diesem Lauf.
  Frühere fremde UI-Typfehler waren hier nicht mehr vorhanden. Kein UI-Abnahmeersatz.
- Globale Architekturprüfung zunächst Exit 1 mit eigenen generierten Build-/Hashartefakten
  und parallel formatierten Webdateien. Eigene Hashmap danach kompakt serialisiert,
  generierten Build unter dem regulär ausgeschlossenen eigenen `dist/` abgelegt.
  Erneuter Lauf weiter Exit 1 ausschließlich wegen fremder Web-/Client-Recovery-Dateien,
  darunter chat-actions 567, chat-runtime 559, organization-runtime 538,
  HermesV2ComposerArea.test 513 und Recovery-JSONs 562/482 Zeilen.
  Vollständige Liste in `architecture-recheck.log`. Kein Backendbefund daraus abgeleitet.
  Alle 114 V2-Backend-/Contractsdateien unter400, Manager397. Keine Baseline geändert.
- SHA-256-Abgleich aller **467** erfassten Backend-/Contracts-/dist-/Altbericht-/externen
  Reviewartefakte: unverändert, keine neuen Backend-/Contractsdateien. Zusätzlich alle
  zwölf V2-Contractquellen identisch zu beiden früheren Gatebaselines. Öffentliche API unverändert.

## Grenzen und Übergabe

Akzeptiert bleiben fehlender atomarer Core-CAS gegenüber autorisierten Classic-/CLI-/FS-
Akteuren und fehlende HOME-Attestation jeder nativen Historyantwort. Die lokale Revision
belegt beobachtete Scopewechsel, keine Datenbankinkarnation. Keine Dateisnapshotgarantie,
keine garantierte native Vision-/PDF-Turnbindung; absolute native Transcriptpfade bleiben
möglich. TTL betrifft nur Wrapt-Metadaten und löscht keine nativen Dateien.

Nur diesen neuen Bericht und eigene temporäre Reviewartefakte geschrieben. Bestehende
Quellen, Tests, Repros und Berichte unverändert. Alle eigenen Fake-/SQLite-/Loopback-
Ressourcen geschlossen. Keine Agents, Browser, echten Core-/Nutzerdatenaktionen,
Dienste, Previews, Git- oder Accountaktionen. Kein Versions-/Changelogauftrag beim Review.
Backend-/Contractsfreigabe erteilt; Root verantwortet weiterhin UI, reale Integration
und den projektweiten Architekturabschluss nach den fremden Formatkorrekturen.
