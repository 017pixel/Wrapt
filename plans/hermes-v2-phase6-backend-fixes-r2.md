# Phase 6 Backend: zweite gezielte Korrektur

Stand: 16.10.2026. Nur R2-M1B und R2-M2 aus dem vollständig gelesenen Backend-R2-Gate.
M1A und alle älteren Gates bleiben verbindlich. Öffentliche API und Contracts unverändert.

## Reproduktion und R2-M1B

- Alle drei neuen Originalrepros vor dem Fix unverändert ausgeführt. Die vier gesunden
  Gegenassertionen scheiterten: ein HOME-Send, zwei verzögerte History-/Snapshotfälle
  sowie ein weitergereichter Organisationszeuge nach dem Callback-Await.
- Nach sämtlichen zusätzlichen Stagingroot-FS-Awaits prüft Stage HOME jetzt nochmals
  direkt vor dem nativen Send. Danach werden Originalconnection, Abo, Profil, Runtime,
  Transport, CWD und Abort erneut synchron geprüft. Eine bereits vorhandene Umbindung
  erzeugt `not_sent`, null file.attach und keine native Datei.
- Die neue dauerhafte Regression verwendet echte Dateisystemaufrufe und verzögert nur
  die Rückgabe der letzten CWD-lstat-Antwort, nachdem die parallele HOME-Prüfung fertig ist.
  Unverändertes HOME bleibt mit einem Stage/Ready gültig; Umbindung erzeugt null Dateien.
- Das unveränderte `home-fs-boundary.mts` zeigt nach dem Fix ebenfalls
  `stages=0,nativeFiles=0,state=not_sent,outcome=not_sent`.
  Sein Exit 1 kommt nun von der unbedingten Vorassertion in Zeile 41, die selbst im
  Ablehnungsfall weiterhin eine native Datei verlangt. Diese fremde Assertion wurde
  nicht geändert. Der eigene gesunde Test verlangt dort ausdrücklich null Dateien.

## R2-M2: eine eingefrorene Historyquelle

- `GatewaySessions.history` erfasst den Quellkontext vor dem REST-Seitenread. Das neue
  kleine `history-context.ts` trägt dieselben unveränderlichen Scopewerte und eine
  lokale Beobachtungsrevision durch beide Projektionen.
- Der ScopeResolver erhöht diese Revision ausschließlich bei einer neu bestätigten
  anderen Scopeidentität. Die erneute Bestätigung desselben Profil/HOME-Scope bleibt
  gültig; ein tatsächlich beobachteter A-B-A-Wechsel entwertet eine alte laufende Lesung.
  Diese lokale Revision behauptet keine Datenbankinkarnation oder atomare Coregarantie.
- Vor dem Attachmentcallback und nach dessen Await prüft die Sessionlesung dieselbe
  Quelle einschließlich HOME erneut. Der Callback erhält den eingefrorenen Kontext,
  statt einen inzwischen aktuellen Scope zu übernehmen. Fehlender/fremder Profilstempel
  erlaubt weiterhin weder Karte noch UIDpersistenz.
- Auch `OrganizationService.history` verlangt diesen ursprünglichen Kontext explizit
  und prüft ihn vor der synchronen Projektion. Eine abgewiesene oder inzwischen stale
  Attachmentprojektion kann die alte Seite nicht unter einer neuen Quelle weiterreichen.
  Bereits erzeugte Karten werden bei anschließendem Kontextverlust aus der Antwort entfernt.
- Ohne gültige Quelle bleibt die lesbare History ohne geratenen Karten-/Readbeleg nutzbar.
  Es entstehen keine fremden Rowzeugen, ReadEvidence oder UIDpins. Keine Resumes,
  zusätzlichen Core-RPCs, Pollschleifen oder neuen öffentlichen Felder.
- Beide unveränderten History-Gegenrepros bestehen jetzt vollständig mit Exit 0:
  verspätete fremde Seiten bleiben ohne Karte/UIDpin, spätere korrekte Seiten behalten
  ihre Karte; Scopewechsel im Callback erzeugt keinen Zeugen und kein Evidence im neuen Scope.

## Regressionen und Dateien

- Neue eigene Tests: `attachments/home-await.test.ts` und `history-await.test.ts`,
  gemeinsame eigene Fakefixture `await-context.fixture.ts`.
- Neun gesunde Fälle: verzögerte FS-Antwort mit/ohne Umbindung, history.read und
  Subscribe/Snapshot mit alter fremder Seite, gleiche Scopebestätigung, anderer Scope,
  echter A-B-A-Wechsel sowie Callback-Await mit/ohne nachfolgendem Organisationswechsel.
- Geändert: `attachments/service.ts`, `session-service.ts`, `manager.ts`,
  `organization/scope.ts`, `organization/service.ts`; neu `history-context.ts`.
  Keine Web-/UI-/E2E-/Config-/Versionsänderung und keine Änderungen fremder Repros/Altberichte.

## Prüfungen

- `pnpm --filter @wrapt/server exec vitest run --cache=false src/hermes`:
  **408/408**, 44 Dateien. Alle bisherigen 399 Fälle plus neun neue Fälle grün.
- Alle **86** unveränderten positiven externen Kontrollgruppen erneut grün:
  R1 boundary 22, HTTP/files 10, composer 13, store 6, runtime 3;
  R2 profile 20, home 6, history 6. Die gesunden ursprünglichen Gegenvarianten bleiben erhalten.
- `pnpm --filter @wrapt/contracts exec tsc -p tsconfig.json`: grün, Dist nicht gelöscht.
- Composer-/Organization-Contracttests: **6/6 grün**.
- `pnpm --filter @wrapt/server exec tsc -p tsconfig.json --noEmit`: grün.
- Scope-ESLint einschließlich neuer Tests und Contracts mit `--max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün; Manager 397, keine Baseline erhöht.
- `pnpm typecheck`: Contracts und Server grün; Gesamtbefehl Exit 2 durch parallel
  bearbeitetes `HermesV2ReasoningControl.tsx` (`selected` in Zeilen 176/184 unbekannt).
  E2E-Typecheck im Gesamtbefehl dadurch nicht erreicht. Keine Webänderung hier.

## Grenzen und Freeze

Die akzeptierten Core-CAS-/Dateisnapshotgrenzen bleiben bestehen. Die zusätzlichen
Prüfungen schließen die konkret belegten lokalen Await-Gegenfälle. Sie garantieren
keine atomare Sperre gegen externe Dateisystem-/Classic-/CLI-Änderungen nach dem letzten
Nachweis und keine vom Core nicht gelieferte HOME-Attestation pro Historyantwort.
Metadaten-TTL löscht weiterhin keine nativen Dateien. Keine echte Core-/Nutzerdatenaktion,
keine Dienste, Browser, Previews, Gitoperationen oder Unteragenten; ausschließlich eigene Fakes.

Produktdateien jetzt ausdrücklich eingefroren. Änderungen erst nach konkreter neuer Root-Freigabe.
Dieser Bericht ersetzt kein unabhängiges Gate.
