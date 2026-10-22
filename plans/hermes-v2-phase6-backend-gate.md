# Hermes V2 Phase 6: unabhängiges Backend-/Contracts-Gate

Stand: 16.10.2026. **Verdict: needs fixes. Zwei Medium-Befunde offen.**
Kein belegter neuer High-Befund. Ausschließlich Phase-6-Backend und Contracts geprüft.
Kein Client-, UI-, Browser-, Realruntime- oder Gesamtfeature-PASS.

## Grundlage und Umfang

Originalauftrag, konkrete Backendfreigabe, Contractentwurf, Interface und Autorenbericht
gelesen. Model-/Commands- und Feature-API-Handoffs sowie Phase-2-Security-/Protokollgates
R1 bis R5 samt Antworten und Phase-4-Backendgates R1 bis R4 samt Antworten abgeglichen.
Die alten abgeschlossenen H/M-Befunde werden hier nicht erneut geöffnet.

Tatsächliche Produktpfade geprüft: Contracts, Queryoptin, Browserprojektion/Redaction,
Command-/Modellnormalisierung, Composeroperationen, Manager/Pool/Queue/Bindungsgrenze,
Session-Schreibprüfung/History sowie alle neuen Attachmentmodule und ihre Tests.
Installierte Corequellen ergänzend ausschließlich statisch gelesen: Katalogshape,
session.activate/-info/-title, file.attach, Staging und Historyprofilstempel.

Neue eigene Artefakte liegen unter `temp/hermes-v2/phase6-backend-review/`.
Die drei `*-repro.mts` erwarten ausdrücklich das reproduzierte Fehlverhalten.
Exit 0 dieser Repros ist kein gesunder Produktcheck. Jeder enthält eine gesunde Kontrolle.

## M1, Medium: Profil und HOME werden nicht vollständig an den frischen Nachweis gebunden

Fundstellen relativ zu `apps/server/src/hermes/v2/`:
`attachments/binding.ts:28–36,40–44`, `session-service.ts:207–220`,
`attachments/files.ts:18–29,45–49`, `attachments/service.ts:44–59,77–95`.

**Variante A, frisches Sessionprofil wird ignoriert.**
Nach regulärem Subscribe/Capture liefert jeder folgende session.activate-Preflight
gültige Info mit `profile_name=anderes-profil`; Connection, CWD, Live-ID und Epoche
bleiben gleich. writable gibt diese Info zurück, aktualisiert aber nur das CWD.
Capture/Recheck verwerfen die Antwort und vergleichen das alte record.profileName.

Repro: `profile-repro.mts`. Ist: sechs frische Activateantworten melden das andere
Profil; trotzdem genau ein file.attach, `ready` und anschließend ein prompt.submit
mit der freigegebenen Attachment-ID. Der Record bleibt irrtümlich `default`.
Gesunde Kontrolle mit durchgehend default: ebenfalls ein erfolgreicher Upload/Submit.
Der native Activatehandler emittiert hier kein zusätzliches Sessioninfoevent, auf das
man die Aktualisierung verschieben könnte (`methods_session.py:1166–1178`).

**Variante B, HOME wird vor Stage vollständig ersetzt.**
Eigenes Profilverzeichnis und davon getrenntes unverändertes Workspace-CWD anlegen.
Nach Capture das Profilverzeichnis umbenennen und seine alte Adresse als Symlink auf
ein anderes eigenes HOME setzen. Erst danach Stage starten, ohne zeitkritisches Rennen.
safeRoot löst den eingefrorenen Homepfad erneut auf und übernimmt kommentarlos das
neue Ziel. Der Scope-Hash bleibt gecacht; sämtliche CWD-Prüfungen bestehen.

Repro: `home-repro.mts`. Ist: `realpath(binding.scope.home) !== binding.scope.home`,
aber file.attach genau einmal, `ready`, Metadatenroot im anderen HOME und Download 200.
Gesunde Kontrolle ohne Ersetzung: ursprünglicher Home-Root, ready und Download 200.

Auswirkung: erkannte beziehungsweise bereits vor den Vorprüfungen vorhandene
Kontextabweichungen verhindern neue native Mutationen und IDfreigabe nicht.
Das verletzt die explizite Profil-/HOME-Bindung. Variante B benötigt Dateisystemzugriff;
kein anonymer Remoteangriff und keine frei vom Browser gesetzte Pfadangabe behauptet.
Beide Varianten liegen vor der Sendgrenze, nicht im akzeptierten atomaren Core-CAS-Gap.

Erforderlich: frische native Profilidentität bei Capture/Recheck tatsächlich auswerten
und das bestätigte Homeziel gegen erneutes Auflösen vergleichen. Vor Send ablehnen;
nach möglicher Annahme unknown/keine IDfreigabe. Stage, Submit und Download einbeziehen.

## M2, Medium: Historykarten vertrauen dem Recordprofil statt dem Profil der Historyseite

Fundstellen relativ zu `apps/server/src/hermes/v2/`:
`session-service.ts:197–203`, `manager.ts:54`, `attachments/service.ts:116–118`,
`attachments/store.ts:93–100`.

Trigger: eigenen Upload mit positivem nativen userRowId-Receipt senden. Beim ersten
Historyread liefert die REST-Seite dieselbe Session-/Row-ID, aber ausdrücklich ein
anderes Profil und eine andere User-UID. Numerische Row-IDs sind profilbezogen.

Repro: `history-profile-repro.mts`. Ist: die fremde Profilrow erhält die eigene
Attachmentkarte. Store.history pinnt deren UID dauerhaft an die eigene Rowzuordnung.
Danach liefert die korrekte Profilseite die tatsächliche User-UID: jetzt null Karten.
Gesunde Kontrolle mit korrektem Profil und UID: bei beiden Reads jeweils eine Karte.
Es werden ausschließlich eigene synthetische Seiten benutzt, keine echten Fremddaten.

Ursache: der Historycallback bekommt nur den früheren Sessionrecord und normalisierte
Rows. raw.profile geht verloren. Die vorhandene Organisationsprojektion prüft dagegen
den tatsächlichen Profilstempel derselben Seite; die neue Attachmentprojektion tut es nicht.

Auswirkung: falsche Anhangszuordnung und dauerhafter Verlust der richtigen Karte durch
das falsche UID-Pinning. Der positive Submitreceipt beweist die Row im bestätigten
Profil, nicht dieselbe Nummer in einer anderen Profil-DB. Kein fremder Ownerdownload
behauptet. Der Profilstempel ist im installierten REST-Vertrag tatsächlich vorhanden
(`hermes_cli/web_routers/sessions.py:757–763`).

Erforderlich: die tatsächliche Seitenidentität vor Kartenprojektion und UID-Persistenz
mit dem bestätigten Scope verbinden. Fehlender/widersprüchlicher Profilnachweis darf
keine Karte und keine dauerhafte UID-Zuordnung erzeugen.

## Unabhängige gesunde Gegenkontrollen

**54 eigene Kontrollgruppen bestanden**, zusätzlich drei gesunde Reprogegenfälle:

- `boundary-controls.mts`, 22 Gruppen: Flag, Originalconnection, Abogeneration,
  Live/Epoche, Scopeinvalidation, CWD und Abort jeweils vor/nach NativeStage;
  CWD-Symlinkwechsel, tatsächlicher HTTP-A→B→A-Wechsel, Stop vor Bodyende,
  individueller verspäteter Release, Konkurrenz, RPCbudget vor Send, UUID genau einmal,
  tatsächliche Katalogshape mit Canon-/Alias-/Quick-/Pluginüberschattung.
- `http-file-controls.mts`, zehn Gruppen: echte eigene Loopback-HTTP-Anfragen ohne
  Bodybytes werden bei falscher Identität/Origin/Connection/Optin/Abo/Flag abgelehnt.
  Echter HTTP-Deadlinepfad mit ausschließlich im Testprozess beschleunigten 40 ms
  statt 60 s; Reservierung frei. DB-/HTTP-Dummys maskiert, Downloads privat mit
  octet-stream/attachment/nosniff/no-store, Historykarten ownerprivat und legacyfrei.
  Dateisymlink verhindert erneuten Submit; Byteabweichung ergibt unknown, manipulierte
  native Datei bleibt manipuliert erhalten und dieselbe UUID staged nicht erneut.
- `composer-controls.mts`, 13 Gruppen: tatsächliche Legacyframes ohne neue Felder,
  echte ConnectionUUID, natives Titelpending/Invalidation, requested/observed/Wire,
  Lazy unconfirmed, Idle/Selection/letzter Modell- und Runningwechsel, none nur bei
  bestätigter Disablefähigkeit, Flagoff, native Kostenbestätigung/deferred.
  Strikte Schemas lehnen Globalsetter, freie RPCs/Commands und doppelte IDs ab.
- `store-controls.mts`, sechs Gruppen: SQL-CAS, verspäteter Fail, doppelte UUID,
  64/512 offene Reservierungen, 512/4096 Metadatenrows sowie 24h/90d-TTL/Cleanup.
- `runtime-controls.mts`, drei Gruppen: originale ws-Sendgrenze vor/nach Annahme
  ergibt not_sent/unknown ohne Retry. Fremde aktive Runtime bleibt nach Flagoff bis
  Hauptturn- und Subagent-Settlement verbunden; null Stop/Close. Tatsächlicher
  Fake-Transport-/Epochwechsel verwirft die alte Capturebindung vor file.attach.

Ausführung aller acht Skripte vom Repository aus:
`pnpm --filter @wrapt/server exec tsx /home/bbecker/projects/Wrapt/temp/hermes-v2/phase6-backend-review/<Name>.mts`.

## Checks, Freeze und Grenzen

- `pnpm --filter @wrapt/server exec vitest run --cache=false src/hermes`:
  **380/380**, 39 Dateien grün, einschließlich aller bisherigen 325 Fälle.
- Zwei explizite Contracttestdateien composer/organization: **6/6 grün**.
- `pnpm typecheck`: Contracts und Server grün. Gesamtbefehl Exit 2 wegen parallel
  bearbeitetem Webtest `HermesV2ChatSurface.test.tsx:24`, cancelModelSelection optional
  statt erforderlich. E2E-Typecheck wurde dadurch nicht erreicht. Kein Gesamtgrün.
- Gezieltes ESLint für V2 und Hermes-V2-Contracts grün; Architekturprüfung grün.
  Eigene Reprodateien 38 bis 150 Zeilen, dieser Bericht unter 180 Zeilen.
- SHA-256-Abgleich aller 128 vorab erfassten Backend-/Contractquellen und Altberichte:
  unverändert. `freeze-before.json`, `freeze-check.json` und Checklogs liegen im Tempordner.

Akzeptiert bleiben fehlender atomarer Classic-/CLI-CWD-/Idle-/Storage-CAS,
Dateireferenz statt garantierter Vision-/PDF-Turnbindung, sichtbare absolute native
Transcriptpfade, Metadaten-TTL ohne Coredateilöschung und fehlende Dateisnapshotgarantie.
Die Befunde verlangen keine dieser fehlenden Coregarantien.

Nur diesen neuen Bericht und eigene temporäre Artefakte geschrieben. Keine Produkt-,
Test-, Altbericht- oder externen Reproänderungen. Alle eigenen Fakes/SQLite/HTTP-Sockets
geschlossen. Keine echten Coreaufrufe, Nutzerdaten, Secrets, Dienste, Devserver,
Previews, Browser, Gitoperationen oder weiteren Agents. Kein Versions-/Changelogauftrag
bei diesem reinen Review. Vor Backend-/Contractsfreigabe M1/M2 gezielt beheben und
in einer neuen unabhängigen Runde prüfen. Client/UI und Gesamtfreigabe bleiben bei Root.
