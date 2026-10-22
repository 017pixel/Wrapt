# Hermes V2 Phase 6: unabhängiger Backend-/Contracts-Recheck R2

Stand: 16.10.2026. **Verdikt: needs fixes. Zwei Medium-Befunde bleiben offen.**
M1A ist geschlossen. Die ursprünglichen synchronen HOME- und fremden/fehlenden
Profilstempel-Fälle sind korrigiert. Zusätzliche Await-Gegenfälle verhindern jedoch
die vollständige Schließung von M1B und M2. Kein neuer High-Befund belegt.
Nur Backend/Contracts, kein Client-, UI-, Browser-, Phase-7- oder Gesamtfeature-PASS.

## Grundlage und Verfahren

Vollständiger Originalauftrag, Phase-6-Auftrag, Entwurf, Interface, beide Handoffs,
R1-Gate und Autorenantwort gelesen. Phase-2-Security-/Protokollgates samt Antworten
und Phase-4-Backendgates samt Antworten abgeglichen. Die dort akzeptierten Grenzen
und geschlossenen Altbefunde bleiben bestehen. Keine neue Auditwelle.

Fixpfade selbst geprüft: writable, Profilereignisse, Capture/Recheck, HOME-Prüfung,
Stagingroots, Stage/Submit/Status/Download, Managercallback, Historynormalisierung,
Kartenprojektion, SQL-UID-Pinning und nachgelagerte Organisationsprojektion.
Die 19 neuen Regressionen gelesen und zusammen mit allen bisherigen Fällen ausgeführt.
Öffentliche API/Contracts unverändert. Alle neuen Artefakte ausschließlich unter
`temp/hermes-v2/phase6-backend-review-r2/`, zusätzlich dieser neue Bericht.

## M1A: geschlossen

Belege relativ zu `apps/server/src/hermes/v2/`: `session-service.ts:217`,
`attachments/binding.ts:31`, `normalize-events.ts:56`.
Die frische Activateantwort setzt die Profilidentität tatsächlich vor dem folgenden
CWD-Await. Fehlende und unbrauchbare Werte verwenden keinen alten Defaultnachweis.
Capture und Recheck vergleichen diesen Wert mit dem bestätigten Profil.

`profile-healthy.mts`: **20 gesunde unabhängige Gruppen**. Anderes, fehlendes,
null und leeres Profil jeweils vor Capture, vor Stage, vor Submit und nach möglicher
Nativeannahme geprüft. Vorher `not_sent` und null neue Mutationen, nachher `unknown`,
genau ein Stage, keine freigegebene ID und native Datei erhalten. Partielle Events
ohne Profil erhalten den Nachweis; explizit unbekannte/fremde Profile entwerten ihn.
Unverändertes Defaultprofil erlaubt Stage, Submit und privaten Download.

## R2-M1B, Medium: HOME wird nach dem letzten Stagingroot-Await nicht erneut geprüft

Fundstellen: `attachments/service.ts:45`, `:46`, `:52`, `:53`;
`attachments/files.ts:18`, `:24`, `:29`. Der Guard nach stagingRoots prüft nur die
synchrone Record-/Connectionbindung. Er löst das bestätigte HOME nicht erneut auf.

Repro: `home-fs-boundary.mts`, gesunde Gegenassertion endet mit **Exit 1**.
Eigenes HOME und davon getrenntes CWD verwenden. Echte FS-Aufrufe ausführen und nur
die Antwort der letzten CWD-lstat-Prüfung verzögern. Die parallel laufende HOME-Root-
Prüfung ist bereits fertig. Während dieser Awaitgrenze HOME vollständig umbenennen
und seine alte Adresse als Symlink auf ein anderes eigenes HOME setzen. Erst danach
die CWD-Prüfung zurückgeben. Keine Mutation an Produktfunktionen oder Returnwerten.

Ist: unmittelbar beim nativen Send gilt nachweislich
`realpath(confirmedHome) !== confirmedHome`, trotzdem **ein file.attach**.
Der Fake schreibt in das andere HOME. Erst der Nachcheck meldet `unknown`.
Die erwartete Vorsendablehnung mit null Stage und `not_sent` bleibt aus.
Gesunde Kontrolle mit derselben verzögerten FS-Antwort ohne Umbindung: ein Stage,
`ready`, unveränderter Root. Der Repro stellt alle lokalen FS-Funktionen wieder her.

Auswirkung: zusätzliche native Schreibwirkung im bereits abweichenden Kontext.
Kein anonymer Pfadangriff behauptet; die Umbindung verlangt Dateisystemzugriff.
Sie liegt vollständig vor Send während eines weiteren lokalen FS-Awaits. Gefordert
ist eine erneute HOME-Prüfung nach diesem Await, kein atomarer Core-Storage-CAS.

Die ursprünglichen Abläufe bestehen in `home-healthy.mts`: **sechs gesunde Gruppen**.
Umbindung vor Capture/Stage und im Activate-Await verhindert Stage. Nach Nativeannahme
bleibt unknown ohne IDfreigabe und ohne Dateilöschung. Ready-Anhänge verweigern nach
Umbindung Status, Submit und Download. Getrenntes unverändertes HOME/CWD funktioniert.

## R2-M2, Medium: verzögerte History verliert ihren ursprünglichen Scope

Fundstellen: `session-service.ts:197`, `:198`, `:202`, `:203`, `manager.ts:54`,
`attachments/service.ts:125`, `:126`, `:129`; nachgelagert
`organization/service.ts:70` und `attachments/store.ts:93`.
raw.profile wird jetzt geprüft, aber der Scope vor dem Seitenread wird nicht
eingefroren. Der Callback nimmt den inzwischen aktuellen Scope. Außerdem gibt sein
neuer Await eine alte Seite anschließend ungeprüft an organization.history weiter.

**Variante A, falsche Karte und dauerhaft falscher UIDpin:**
`history-stale-scope.mts`, **Exit 1** für beide gesunden Gegenassertionen.
Eigenen Anhang in HOME A an Row 1 mit positivem Submitreceipt binden. HOME B mit
demselben Profilnamen bestätigen, dessen synthetische Row 1 eine andere UID hat.
Eine Seite aus B beginnen und ihre Antwort halten. Währenddessen wieder A bestätigen,
dann die unveränderte B-Seite liefern. Keine SQL-Schreibzugriffe durch den Repro.

Ist sowohl bei history.read als auch Subscribe/Snapshot: die alte B-Seite erhält
die Karte aus A; SQL pinnt ihre falsche UID A an die eigene Row. Der anschließende
korrekte Read aus HOME A mit UID B erhält **keine Karte**. Geprüft wird tatsächlich
messages[].attachments, keine Textsuche nach der auch im nativen Dateipfad stehenden ID.
Gesunde Kontrollen ohne Scopewechsel behalten die richtige Karte und UID bei beiden Reads.

**Variante B, neue Callback-Awaitgrenze reicht veraltete Organisationsbelege durch:**
`history-callback-context.mts`, **Exit 1**. Reguläre History mit eigener Assistantrow
aus A beginnen. Die echte HOME-lstat-Antwort innerhalb des neuen asynchronen
Attachmentcallbacks halten; währenddessen B mit gleichem Profilnamen bestätigen.
Nach Freigabe überspringt AttachmentService korrekt die alte Kartenprojektion.
GatewaySessions ruft danach trotzdem organization.history mit derselben alten Seite auf.
Ist: deren Row/UID wird in **Scope B** gespeichert und ein ReadEvidence ausgegeben.
Gesunde Kontrolle ohne Wechsel speichert den Zeugen ausschließlich im richtigen Scope.
Dies ist ein direkt betroffener Integrationspfad, keine Wiederöffnung der alten
EQUAL-/COVERS-/ACK-Befunde und keine Behauptung eines bereits ausgeführten falschen ACK.

Erforderlich: Seitenkontext vor dem Read erfassen und nach allen Awaitgrenzen bis zur
Karten-/UID- und Organisationsprojektion beibehalten beziehungsweise bei Änderung
verwerfen. Ein gleicher Profilname allein beweist kein gleiches HOME. Eine abgewiesene
Attachmentprojektion darf keinen veralteten Kontext an die folgende Projektion freigeben.

Die ursprüngliche M2-Profilstempelkorrektur besteht in `history-healthy.mts`:
**sechs gesunde Gruppen**, je history.read/Subscribe und fremdes/fehlendes/leeres Profil.
Keine Karte und kein UIDpin; später richtige Seite mit richtiger Karte/UID. Zweiter
Owner und Legacyverbindung erhalten keine Karte. Auch eine schon korrekt gepinnte UID
autorisiert auf einer fremden Profilseite keine Karte.

## Ausgeführte Checks und Freeze

- Alle **54 unveränderten** positiven R1-Kontrollgruppen grün: boundary 22,
  HTTP/files 10, composer 13, store 6, runtime 3. Secret-/Owner-/Legacy-/Send-/Unknown-
  und Runtimehaltungsgrenzen bleiben in diesen Gegenkontrollen erhalten.
- Neue reine Kontrollskripte: **32 gesunde Gruppen**, Profil 20, HOME 6, History 6.
  Die drei zusätzlichen Fehlerrepros enthalten vier weitere gesunde Gegenvarianten.
  Ihre **vier negativen Gegenassertionen** scheitern wie oben beschrieben.
- `pnpm --filter @wrapt/server exec vitest run --cache=false src/hermes`:
  **399/399 grün**, 42 Dateien, alle bisherigen 380 plus 19 neue Fälle erhalten.
- Composer-/Organization-Contracttests: **6/6 grün**. Server-Typecheck und gezieltes
  ESLint für V2 und Hermes-V2-Contracts mit max-warnings=0 grün.
- `pnpm typecheck`: Contracts und Server grün; Gesamtbefehl **Exit 2** durch parallel
  bearbeitete Web-Composerdateien/Tests. E2E-Typcheck deshalb nicht erreicht.
  Kein Gesamtgrün und kein neuer Backendfehler daraus abgeleitet.
- Architekturprüfung in dieser Runde grün, die zuvor gemeldete parallele CSS405-
  Überschreitung liegt beim eigenen Lauf nicht mehr vor. Keine Baseline geändert.
- SHA-256-Vergleich: Backend, Contracts, alte Gates und externe Repros unverändert.
  Einzig Root hat parallel seine nicht eingefrorenen phase6-integration-notes geändert.
  Baseline, Vergleich und Checklogs liegen im neuen Tempordner. Handdateien unter400,
  dieser Bericht unter180 Zeilen.

Ausführung aller eigenen Skripte vom Repository aus:
`pnpm --filter @wrapt/server exec tsx /home/bbecker/projects/Wrapt/temp/hermes-v2/phase6-backend-review-r2/<Name>.mts`.
Die alten profile-/home-/history-profile-repro wurden nicht verändert oder als gesunde
Checks gewertet. Neue Skripte verwenden ausdrücklich gesunde Gegenassertionen.

Keine Produkt-, Bestands-/Alttest-, Altbericht- oder externen Reproänderungen.
Alle eigenen Fakes, SQLite, Dateihandles und Loopbackverbindungen geschlossen.
Keine echten Core-/CLI-/HTTP-Nutzerdatenaktionen, Browser, Dienste, Previews, Git,
Account-/Authänderungen oder weitere Agents. Kein Versions-/Changelogauftrag beim Review.
Akzeptiert bleiben Core-CAS-/Dateisnapshotgrenzen, Dateireferenz statt garantierter
Vision-/PDF-Bindung, sichtbare native absolute Pfade und reine Metadaten-TTL.
Vor Backend-/Contractsfreigabe R2-M1B und R2-M2 beheben und frisch unabhängig prüfen.
