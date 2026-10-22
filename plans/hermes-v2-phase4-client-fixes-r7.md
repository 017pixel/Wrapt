# Hermes V2: Phase-4-Clientkorrektur R7

Stand: 16.10.2026. R7-M1 im freigegebenen nonvisuellen Scope korrigiert.
Autorenbericht mit selbst ausgeführten Regressionen, keine unabhängige Freigabe.
Der eigene Client-Scope ist erneut eingefroren. Phase 5 bleibt unbegonnen.

## Auslöser und Korrektur

phase4-client-gate-r7 vollständig sowie alle drei neuen externen Testdateien gelesen.
Vor der Änderung alle 146 externen Fälle ausgeführt: 144 grün, exakt die zwei
gemeldeten gesunden Assertions rot. Ein alter terminaler Seitenabschluss setzte
nach erfolgreichem Backfill complete=true, obwohl neuere Metadaten die Pinliste
inzwischen entwertet hatten. Ausdrückliches Gruppenladen blieb dann ohne Abruf.

organization-state führt eine kleine lokale Membership-Invalidierungsrevision.
Eine akzeptierte höhere Rowrevision, erstmals bekannte Organisation oder höhere
Pinrevision entwertet die Listen. Neue unorganisierte Baseline-Rows, identische
Rowrevisionen und verworfene ältere Metadaten erzeugen keine falsche Entwertung.
Die Entwertung beendet die Verwendbarkeit des alten Paginationcursors für alle
drei Gruppen, deren Servercursor an die globale membership_revision gebunden ist.
Sie ist ausschließlich eine lokale Änderungsbarriere und kein Lesebelegcursor.

organization-queries erfasst diese Barriere vor dem Members-HTTPabruf. Nach dessen
Antwort prüft es inzwischen eingegangene Entwertungen, bereits neuere Rowmetadaten
und die bekannte Pinrevision. Eigene page.items werden separat angewandt. Ihr
eigener Effekt darf den bisherigen Fehlercursor dieser Seite nicht entwerten.
Nach ihrem Anwenden wird die Barriere für den folgenden Summarylookup erfasst.
Der abschließende Commit prüft auch diese zweite Awaitgrenze.

Ein überholter erfolgreicher Seitenabschluss darf die belegten Rows und Summaries
anzeigen, bestätigt jedoch weder Vollständigkeit noch weitere Pagination:
complete=false, hasMore=false, cursor=null. Der nächste ausdrückliche loadMembers
beginnt bei Seite eins und kann die aktuelle Liste wirklich bestätigen. Eine
laufende Pinvorbereitung startet dadurch keine automatische neue Abfragekette.

Ein reiner Lookupfehler ohne zwischenzeitliche Invalidierung behält weiterhin
den letzten erfolgreichen Seitenstand samt erneut ladbarem Cursor aus R6.
Gemeinsame Runtimeverantwortung, individuelle Ownerfortsetzungen, Zyklus-/Abort-
Grenzen und monotone per-ID-Summaryordnung bleiben erhalten. Keine neue Retry-
oder Pollingverwaltung, kein Mutationreplay und keine zusätzliche Readquelle.

organization-runtime entwertet bereits beim gültigen metadata.invalidated-Ereignis,
bevor dessen HTTP-Metadatenabruf antwortet. Ein hängender oder fehlerhafter GET
erlaubt daher keinen alten vollständigen Seitenabschluss. organization-actions
und der Membership-Catch übernehmen höhere Pinrevisionen auch aus leerem 409 über
dieselbe Entwertung. Leere frische Seiten können ihre eigene neue Revision gültig
bestätigen; der Pins-/Snooze-/Settled-Abgleich bleibt ausdrücklich begrenzt.

## Dauerhafte Regressionen

organization-member-invalidation.test.ts ergänzt 26 Fälle:

- Je Pins/Snooze/Settled neuere Metadaten während Members-HTTP und während Lookup;
  ausdrücklicher erneuter Abruf bestätigt anschließend die aktuelle leere Liste.
- Erstmalig bekannte organisierte Row während Backfill; erneutes Laden enthält
  beide Mitglieder statt die neue Row durch alte Vollständigkeit zu verstecken.
- Nichtterminale überholte Seite beendet Folgeseiten und lässt ausdrücklich bei
  Cursor null neu beginnen, ohne selbst neue Requests oder Mutationen zu senden.
- Bereits vor dem Abruf bekannte höhere Rowrevision verhindert alte Bestätigung.
- Eigene neue Seitenmetadaten, identische externe Rows und neue unorganisierte
  Baselines erlauben weiterhin einen gesunden vollständigen Abschluss.
- Ältere externe Rowmetadaten werden verworfen; eine eigene aktuelle Seite bleibt
  bestätigt. Eigene leere Seiten dürfen eine höhere Pinrevision selbst bestätigen.
- Echtes metadata.invalidated vor einem hängenden, später fehlerhaften GET sowie
  höhere Pinrevision aus leerem 409 während einer wartenden Snoozeseite.

Neuere Summary-/Requestactivity bleibt trotz verspätetem alten Lookup erhalten.
Alle bisherigen R1 bis R6 sowie deren externen Assertions und Berichte unverändert.

## Ausgeführte Checks und Freeze

- Unveränderte 14 externe Dateien: **146/146 grün**. Kommando:
  pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=dot.
- 22 nonvisuelle Featuredateien: **257/257 grün**, alle bisherigen 231 Fälle und
  26 neue R7-Regressionen. pnpm exec vitest run im Webverzeichnis mit den sieben
  Chat-/Gateway-Testpfaden, sidebar-domain, organization-*.test.ts,
  chat-read-evidence und useHermesV2Sidebar; Glob im Webverzeichnis expandiert.
- Vollständiges pnpm typecheck grün, einschließlich Contracts/Server/Web/E2E.
- Gezieltes ESLint aller nonvisuellen Organisations-/Sidebar-/Chat-/Gatewaymodule
  und Hooks samt eigenen Tests mit --max-warnings=0 grün.
- pnpm architecture:file-lines grün. Query 158, State 118, Runtime 237, Actions
  115, neue Testdatei 161 Zeilen; dieser Bericht bleibt unter 120 Zeilen.

Produktänderungen nur in organization-queries/state/runtime/actions, dazu eine
neue eigene Testdatei und dieser Bericht. Öffentliche UI-API unverändert. Keine
UI-/Backend-/Contracts-/E2E-/Altberichtänderungen, Browser, Dienste, Previews,
echten Hermesaufrufe, Git oder weiteren Agents. Versionierung und CHANGELOG
bleiben gemäß Ownership bei Root. Ein frischer unabhängiger Recheck folgt separat;
dieser Autorenbericht erklärt keinen eigenen Gate-PASS.
