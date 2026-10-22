# Hermes V2: Phase-4-Clientkorrektur R6

Stand: 16.10.2026. R6-M1 im freigegebenen nonvisuellen Scope korrigiert.
Dies ist der Autorenbericht mit ausgeführten Regressionen, keine unabhängige
Freigabe. Der Client ist erneut eingefroren. Phase 5 bleibt unbegonnen.

## Befund und Korrektur

Den vollständigen Bericht phase4-client-gate-r6 sowie beide neuen externen
Testdateien gelesen. Vor der Änderung alle 125 externen Fälle selbst ausgeführt:
123 grün, exakt die beiden neuen Fälle für unbekannte und veraltete Summaries rot.
Nach HTTP 503 beim ersten gemeinsamen Backfill war bereits der zweite Cursor
gespeichert. Ausdrückliches Gruppenladen übersprang dadurch die fehlenden Daten.

organization-queries.ts:115 bis :125 übernimmt Membership-IDs, Revision,
Pinrevision und cursor/hasMore/complete erst nach erfolgreichem Summary-/Activity-
Lookup und erneutem ursprünglichem Runtimeguard. Vorher gelesene gültige private
Metadaten und Serverzeit dürfen weiterhin übernommen werden. Scheitert der
Backfill, bleiben der zuletzt vollständig bearbeitete Seitenstand und dessen
Cursor erhalten. Ein ausdrücklicher weiterer Abruf lädt dieselbe Seite erneut.
Scheitert Seite zwei, bleiben die erfolgreichen Daten der ersten Seite bestehen.

Keine Retryverwaltung, automatische Wiederholung, Pollschleife oder zusätzliche
Readquelle eingeführt. Der schon autorisierte gemeinsame Seitentask bleibt an
seinen ursprünglichen Runtimezyklus gebunden. Individuelle Ownerfortsetzungen,
Resetwarteketten, Off/On-Abbruch und monotone per-ID-Leseordnung bleiben erhalten.
Gültiges Missing gilt als erfolgreicher Backfill mit ehrlicher fehlender Summary.
Fehlerhafte Membership- oder Lookupprojektionen bestätigen keinen Seitenfortschritt.
Normale Pagination fordert weiterhin nur ausdrücklich die nächste Seite an.

## Dauerhafte Regressionen

organization-member-backfill.test.ts enthält neun neue Fälle:

- Unbekannte und veraltete Summary: A startet, B wartet, A wird geschlossen,
  Lookup scheitert. Kein automatischer Retry; B lädt ausdrücklich denselben Cursor,
  sieht die offene Anfrage und kann anschließend regulär Seite zwei abschließen.
- Fehler auf Seite zwei erhält die erste Seite und wiederholt nur Seite zwei.
- Ungültige Membershipantwort und fremde Lookuppartition bestätigen keine Seite;
  ein anschließender ausdrücklicher gültiger Abruf funktioniert.
- Gesunde Pagination führt genau einen Lookup je Seite aus und wartet auf den
  nächsten ausdrücklichen Aufruf. Nach Vollständigkeit bleibt loadMembers ohne IO.
- Ein wartender Reset beginnt nach dem gemeinsamen Backfill erneut bei Seite eins,
  auch wenn der erste Owner inzwischen geschlossen wurde.
- Flag-off sowie Off/On während eines ignorierten Transportabbruchs verhindern
  nachträglichen Seitenfortschritt, alte Summaries und Folgeverkehr im neuen Zyklus.

Eine eigene frühere R5-Autorenassertion in organization-shared-members.test.ts:28
präzisiert: Während des noch ausstehenden Backfills gilt complete=false und
loading=true. Das vorher geprüfte complete=true behauptete verfrühte Vollständigkeit.
Alle acht R5-Fälle bleiben mit dieser fachlich korrigierten Erwartung erhalten.
Externe Repros und sämtliche alten Berichte unverändert.

## Ausgeführte Checks

- Alle elf externen Dateien: **125/125 grün**. Unverändertes Kommando:
  pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=dot.
- Alle 21 nonvisuellen Featuredateien: **231/231 grün**, darin sämtliche bisherigen
  222 Fälle einschließlich Phase-3-R3 sowie die neun neuen R6-Regressionen.
  Ausgeführt aus apps/web mit pnpm exec vitest run, expliziten sieben Chat-/Gateway-
  Testpfaden, sidebar-domain, organization-*.test.ts, chat-read-evidence und
  useHermesV2Sidebar. Der Organisationsglob wurde im richtigen Webverzeichnis
  expandiert; der vollständige Lauf bestätigt 21 Dateien und 231 Fälle.
- Vollständiges pnpm typecheck grün, einschließlich Contracts, Server, Web und E2E.
- Gezieltes ESLint aller nonvisuellen Organisations-/Sidebar-/Chat-/Gatewaymodule
  und Hooks samt eigenen Tests mit --max-warnings=0 grün.
- pnpm architecture:file-lines grün. Querymodul 150, neue Testdatei 128 und
  angepasste eigene R5-Testdatei 79 Zeilen; dieser Bericht unter 120 Zeilen.

Produktänderung ausschließlich am Membership-Commitpunkt in organization-queries.
Öffentliche UI-API, Backend und Contracts unverändert. Keine UI-, Browser-, Dienst-,
Preview-, Git- oder echten Hermesaufrufe; keine weiteren Agents. Versionierung und
CHANGELOG bleiben gemäß Scope bei Root. Frischer unabhängiger R7-Recheck folgt
durch getrennten Auftrag; dieser Bericht erklärt keinen eigenen Gate-PASS.
