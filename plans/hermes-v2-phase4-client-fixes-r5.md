# Phase 4: Clientkorrektur nach Gate R5

Stand: 16.10.2026. R5-M1 im nonvisuellen Autorenscope korrigiert; Scope erneut
eingefroren. Frischer unabhängiger Recheck bleibt erforderlich. Kein Selbstreview-
PASS und keine Freigabe des gesamten Phase-4-Produkts.

## Vor dem Fix reproduziert

Vollständigen Gatebericht und `r5-shared-read.test.ts` gelesen. Externe Suite vor
Produktänderungen selbst ausgeführt: 107/110 grün, genau drei gesunde Assertions
rot. Eine angenommene Pinseite verliert bei Ownerabbruch den fehlenden beziehungsweise
erneuernden Summary-/Activitybackfill. Zweiter Owner und explizites Gruppenladen
sehen dadurch keine belegte wartende Anfrage. Keine externe Datei geändert.

## R5-M1: globale Seite und Backfill behalten dieselbe Verantwortung

Die fachliche Ownership ist jetzt ausdrücklich getrennt:

- Der Start eines Membershipreads und individuelle Folgeaktionen verlangen den
  ursprünglichen gültigen Ownerkontext.
- Eine bereits gestartete globale Membershipseite einschließlich ihres begrenzten
  Summary-/Activitybackfills gehört zum ursprünglichen Runtimezyklus und Signal.

`organization-queries.ts` gibt dem geteilten loadMembers-Task deshalb die bereits
erfasste Runtimeprüfung statt der zusammengesetzten Ownerprüfung. Die Seite und
ihr zugehöriger Lookup werden innerhalb desselben ursprünglichen Runtime zu Ende
projiziert, auch wenn Owner A inzwischen geschlossen, unsichtbar oder in anderer
Querygeneration ist. Der weiterhin gültige Owner B erhält damit den angekündigten
geteilten Stand. Es wird kein zusätzlicher Reparaturrequest oder pauschaler Retry
benötigt. Die normale Singleflight-Menge bleibt unverändert.

Owner A erhält dadurch keine neue Vorbereitung, nächste Membershipseite, Notices-
Fortsetzung oder Mutation. Seine individuellen Fortsetzungen prüfen weiterhin
Owner-/Querygeneration. Direkte ausdrücklich ownergebundene Lookups und wartende
Freshreads behalten ihre bisherige Abbruchregel.

Flag-off und Off/On entwerten weiterhin den ursprünglichen Runtimezyklus samt
Signal: alte Membership-, Lookup-, Fehler- und Finallypfade übernehmen nichts in
den geleerten oder neuen Stand. Ein tatsächlicher Backfillfehler bleibt sichtbar,
setzt die vorläufige Vollständigkeit zurück und wiederholt sich nicht automatisch.
Ein ausdrücklich erneut angefordertes Gruppenladen kann den Fehler reparieren.

## Dauerhafte Regressionen

Neue `organization-shared-members.test.ts` mit acht Fällen:

- Unbekannte alte Pin-ID jenseits der ersten Katalogseite: Release, neue Owner-
  generation und neue Query während des gehaltenen Sharedlookups. Owner B erhält
  Titel, requestCount=1 und Needs input aus genau einem Lookup.
- Bereits bekannte veraltete Summary/idle: Release beziehungsweise neue Generation
  während ausdrücklich geteiltem Refresh. Owner B erhält den frischen Stand.
- Tatsächlicher Backfillfehler: kein automatischer Retry; ausdrücklich erneutes
  Gruppenladen stellt die wartende Anfrage korrekt dar.
- Globaler alter Backfill wird nach Off/On nicht in den neuen Runtime übernommen.
- Ein weiterhin ausdrücklich ownergebundener Lookup und ungültiger Membershipstart
  bleiben nach Generationswechsel gesperrt.

Zwei bestehende R4-Autorenassertions in `organization-pin-lifetime.test.ts` sind
fachlich präzisiert: Nach Abbruch der Pinvorbereitung gibt es keine neue Membership-
seite des alten Owners. Genau der bereits autorisierte gemeinsame Summarybackfill
für den gültigen anderen Owner darf jedoch fertig werden. Der ursprüngliche
Abbruchfall bleibt erhalten; externe R4-/R5-Repros sind unverändert.

## Dateien und Prüfungen

Produktänderung ausschließlich `organization-queries.ts` unter
`apps/web/src/components/hermes/v2/`: Zuordnung des geteilten Membershiptasks.
Keine neue Abstraktion, neue API, Änderung der Readbelege oder Mutationswiederholung.

- 222/222 Featuretests in 20 Dateien grün: alle 214 bisherigen Fälle einschließlich
  sämtlicher 88 Phase-3-Regressionsfälle plus acht neue R5-Fälle.
- Unveränderte externe 110/110 Fälle in neun Dateien grün. Kommando:
  `pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
- Gezieltes ESLint der nonvisuellen Module/Tests mit `--max-warnings=0` grün.
- Vollständiges `pnpm typecheck` einschließlich Contracts, Server, Web und E2E grün.
- `pnpm architecture:file-lines` grün; alle eigenen Dateien unter 400 Zeilen.

Keine UI-/Backend-/Contracts-/Root-E2E-Änderungen, Browser, Dienste, echten Requests,
Commits oder zusätzlichen Agents. Gesamtversionierung bleibt gemäß Teilauftrag
bei Root. Keine Phase-5-Arbeit begonnen.
