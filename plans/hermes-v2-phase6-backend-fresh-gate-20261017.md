# Hermes V2 Phase 6: unabhängiges Backend-/Contracts-Gate der Nachsendkorrektur

Stand: 17.10.2026. **Verdikt: PASS ausschließlich für den geprüften Phase-6-Backend-/Contractscope.**
**M1-Nachsend, Medium: geschlossen. L1, Low: geschlossen.**
Keine neuen belegten Findings im vereinbarten Scope. Keine Phase-7-, UI-, Browser-,
Realruntime- oder Gesamtfreigabe.

## Grundlage und tatsächlicher Änderungsumfang

AGENTS vollständig gelesen. Vollständigen Originalauftrag, übergebene R1-/R2-/R3-Findings,
Antworten, frischen Zusatzbericht und aktuelle Autorenantwort gegen die Quellen geprüft.
Den Autorenbericht `hermes-v2-phase6-backend-fixes-r3.md` samt abgeschlossenen Checkresultaten
vor diesem Abschluss nochmals gelesen. Seine PASS-Aussagen ersetzen keine eigenen Prüfungen.

Hashvergleich mit der 555-Dateien-Autorenbaseline bestätigt genau drei geänderte Bestandsdateien,
alle relativ zu `apps/server/src/hermes/v2/`:

- `operations.ts`: Nachsendprüfung vor Rowpersistenz und Erfolgsprojektion.
- `attachments/binding.ts`: vorhandene Scopebeobachtungsrevision im Capture eingefroren.
- `attachments/service.ts`: Nachcheck derselben Bindung und finaler Statusvergleich.

Genau zwei neue V2-Quelldateien: `attachments/submit-postcheck.test.ts` und
`attachments/status-context.test.ts`. Bestehende Backendtests und öffentliche Contracts
gegen die Autorenbaseline unverändert. Kein neuer Contract oder öffentlicher API-Parameter.

## M1-Nachsend: geschlossen

Fundstellen relativ zu demselben V2-Verzeichnis: `operations.ts:119`, `:120`, `:122`,
`:123`, `:124`; `attachments/service.ts:96`, `:97`, `:98`, `:99`;
`attachments/binding.ts:30`, `:34`. Outcome und Runtimehaltung: `mutation-outcome.ts:11`,
`:31`, `manager.ts:128`.

Der Prompt verwendet die vorbereitete ursprüngliche Capturebindung. Nach dem tatsächlichen
RPC-Await läuft deren synchroner Assert zuerst, anschließend der HOME-Nachweis und erneut
derselbe Assert. Nach dem Nachcheck-Await steht ein weiterer synchroner Assert unmittelbar
vor `used`. Es gibt dort kein neues writable/activate, das einen beobachteten Profilverlust
durch einen frischen anderen Nachweis überschreiben könnte.

Eigene Gegenproben in `temp/hermes-v2/phase6-backend-fresh-gate-20261017/`:

- `submit-controls.mts`, **32 gesunde Gruppen**. Sechs echte Fake-RPC-Antwortfälle,
  23 Varianten an beiden echten HOME-realpath-/lstat-Awaits des neuen Nachchecks und
  drei Wiederverwendungen mit vorher sicherem, durch History-UID gepinntem Row1-Beleg.
- Unverändert, explizit gleiches Profil und partielle session.info ohne Profilfeld bleiben
  erfolgreich. Fremdes/null-Profil erreicht den Manager vor dem RPC-Resultat über den echten
  Fake-WebSocket. Der initiale Assert lehnt bereits vor dem HOME-Check ab, Ergebnis unknown.
- Während beider FS-Awaits führen fremdes/null-Profil, anderer Scope, beobachtetes A→B→A,
  Flagoff, erneuerte Abogeneration oder beobachteter CWD-Wechsel zu unknown. Es entsteht
  keine neue Rowzuordnung; SQL-Row, Revision und TTL bleiben unverändert. Gleiche
  Scopebestätigung erhöht die Revision nicht und bleibt erfolgreich.
- HOME vollständig vor der Promptantwort oder zwischen HOME-realpath und lstat auf ein
  eigenes anderes Ziel umgebunden: unknown ohne neuen Rowbeleg. Nur echte FS-Ergebnisse
  werden verzögert; keine Statdaten erfunden und keine Produktfunktionen ersetzt.
- Ein früherer sicherer Row1-Beleg bleibt bei zweitem unknown durch fremdes/null-Profil
  oder A→B→A exakt erhalten, einschließlich logischer UID. Keine Row2-Zuordnung entsteht.
  Ein anschließender frischer Historyread zeigt die Karte an Row1, keine Karte an Row2.
- Je Versuch genau ein Prompt, je Datei ein Upload, kein Retry, kein neuer Activateaufruf
  nach dem Prompt und keine Stop-/Close-/Delete-Mutation. Native Bytes bleiben erhalten.
  Nach unknown sind Running/Background unbekannt, Schutzhaltepunkt und Runtimehaltung aktiv.

`presend-status-controls.mts` enthält zusätzlich einen unveränderten Submit sowie sieben
Gegenproben am tatsächlich beobachteten letzten Vorsend-HOME-Await. Gleiche Bestätigung
und partielles Event bleiben erfolgreich; fremd/null, anderer Scope, A→B→A oder verlorene
Bestätigung ergeben **not_sent und null Prompts**. Drei weitere Capture-/Stagefälle zeigen:
gleiche Bestätigung bleibt gültig, anderer Scope/A→B→A ergeben not_sent und null Dateien.
Dies verlangt keine atomare Sperre gegenüber externen Akteuren nach dem letzten Nachweis.

## L1: geschlossen

Fundstellen: `attachments/service.ts:104`, `:105`, `:106`, `:107`, `:108`.
Nach dem HOME-Await werden ursprüngliche Scope-ID und Beobachtungsrevision synchron
verglichen, bevor eine Readykarte gelesen oder ausgegeben wird.

`presend-status-controls.mts`: insgesamt **22 gesunde Gruppen**, davon elf Statusfälle.
Beide echten HOME-FS-Awaits mit unverändertem Kontext, gleicher Neubestätigung, anderem
Scope, A→B→A und verlorener Bestätigung geprüft; zusätzlich HOME-Umbindung zwischen
realpath und lstat. Ungültiger Kontext erzeugt STALE_REQUEST/not_sent ohne Readykarte.
Unverändert/gleiche Bestätigung liefern dieselbe Karte. Keine SQL-, Byte- oder RPC-Mutation.
Das unveränderte ursprüngliche HTTP-Repro bestätigt tatsächlich **409/STALE_REQUEST**
bei Scopewechsel und **200/ready** ohne Wechsel.

## Unveränderte Regressionen und Pflichtchecks

- Alle **138/138** positiven Altgruppen unverändert grün: R1 54, R2 32, R3 52.
  Secret-/Owner-/Legacy-, Send-/Unknown-, History-/UID-/Organisations- und
  Background-/Runtimehaltungsgrenzen bleiben damit durch eigene Wiederholung belegt.
- Vier vorgeschriebene frische Skripte unverändert grün, **56/56** Gruppen:
  submit-postcheck 5, status-context 2, binding-healthy 23, history-healthy 26.
  M1A, HOME-/Stage-Awaits und M2/History-Kontext bleiben in diesen Kontrollen geschlossen.
- Eigene neue Gruppen: **54/54**, aufgeteilt in Submit 32 und Vorsend/Status 22.
  Eigene Fixture und FS-Gates neu geschrieben; nur etablierte FakeGateway-Klasse wiederverwendet.
- Alle sechs alten Fehlerrepros unverändert ausgeführt. Beide R2-Historyrepros Exit0.
  Drei R1-Bugrepros Exit1, weil sie ausdrücklich die inzwischen verhinderten Fehler erwarten;
  ihre gesunden Kontrollen bestehen. `home-fs-boundary` zeigt null Stage/null Dateien/not_sent,
  Exit1 ausschließlich wegen seiner bekannten unbedingten Native-Datei-Vorassertion Zeile41.
  Kein solcher Exit wurde als gesunder Produktcheck gezählt oder durch Assertionänderung beseitigt.
- Hermes-Suite mit `--cache=false`: **424/424**, 46 Dateien. Alle 408 bisherigen Fälle
  unverändert erhalten, dazu die 16 neuen Autorregressionen.
- Composer-/Organization-Contracts mit `--cache=false`: **6/6**, zwei Dateien.
- Contracts zusätzlich erfolgreich nach eigenem `dist/contracts` gebaut; Package-dist unverändert.
- **pnpm typecheck vollständig grün**, einschließlich Server, Web und E2E.
- Fachlich begrenztes ESLint für V2 und Hermes-V2-Contracts, max-warnings=0: grün.
- **pnpm architecture:file-lines grün**, auch nach Anlage aller eigenen Handdateien und Bericht.
  Keine Baseline erhöht; eigene Handdateien unter400, dieser Bericht unter200 Zeilen.

Alle Befehle und Einzelergebnisse liegen im eigenen Tempordner. Unveränderte externe
Skripte liefen per `pnpm --filter @wrapt/server exec tsx <absoluter Skriptpfad>`;
`verify.py` hält Suite-, Contract-, Typecheck-, Lint- und Architekturbefehle fest.

## Freeze, Grenzen und Übergabe

Autoren-Codefreeze: **141/141 identisch**. Eigener breiter SHA-256-Abgleich: 1156 erfasste
Artefakte, davon 1154 identisch. Parallel änderten sich die außerhalb des Codefreezes
liegenden Orchestratorarbeitsdokumente `plans/hermes-v2-progress.md` und
`plans/hermes-v2-work-handoff.md`.
Backend, Contracts, Package-dist, bestehende Gates, Autorenbericht und fremde Repros
blieben unverändert; keine neuen Backend-/Contractsdateien während dieses Reviews.
Die breiten Hashchecks meldeten diese Änderungen; der abschließende Abgleich weist sie
ausdrücklich separat aus. Baseline nicht ersetzt, keine Abweichung verschwiegen.

SHA-256 von `freeze-before.json`:
`4fa1218160d989534bcb148e498556c1633341b4303d816e4a6b6c874e1dd1e8`.
Autoren-`code-freeze.json` SHA-256:
`6bda00896ba8db75a95b0940ab0507049f01252d4b2a9557723aa6117261624b`.
`freeze-check.json` und `freeze-final.json` enthalten den abschließenden Einzelvergleich.

Akzeptiert bleiben fehlender atomarer Core-CAS und fehlende Dateisnapshotgarantie,
fehlende HOME-Attestation jeder nativen Antwort, Dateireferenz statt garantierter
Vision-/PDF-Turnbindung, sichtbare absolute native Pfade und reine Metadaten-TTL.
Die lokale Scopegeneration belegt beobachtete Wechsel, keine Datenbankinkarnation.

Nur diesen neuen Bericht und eigene temporäre Artefakte geschrieben. Keine Produkt-,
Bestands-/Alttest-, fremden Repro- oder Altberichtänderung. Eigene Fakes, SQLite,
Dateihandles und Loopbacks geschlossen; keine zurückgelassenen eigenen Fallverzeichnisse.
Keine echten Core-/CLI-/Nutzerdaten-/Browser-/Dienst-/Git-/Account-/Preview-/Slotaktionen,
keine weiteren Agents und kein Commit/Push/Restart. Versionspflege bleibt bei Root.
Der PASS gilt nur für diesen Backend-/Contracts-Recheck; weitere Phasen verantwortet Root.
