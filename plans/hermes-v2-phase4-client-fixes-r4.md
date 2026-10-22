# Phase 4: Clientkorrekturen nach Gate R4

Stand: 16.10.2026. R4-H1 und R4-M1 im nonvisuellen Autorenscope korrigiert.
Scope erneut eingefroren. Frischer unabhängiger Recheck bleibt erforderlich;
kein Selbstreview-PASS und keine Freigabe von Phase 4 insgesamt.

## Vor dem Fix reproduziert

Vollständigen Gatebericht und neue r4-reorder/r4-lifecycle/r4-projects-Repros
gelesen. Externe Suite vor Produktänderungen selbst ausgeführt: 72/88 grün,
genau 16 gesunde Assertions rot. Der Testwächter der Pinvorbereitung zählt 17
deaktivierte No-op-Aufrufe, die übrigen Fehler belegen alte fortgesetzte Reads.
Keine externe Reprodatei oder bisherigen Berichte geändert.

## R4-H1: vollständige Pinvorbereitung endet bei Abbruch

`organization-actions.ts` bindet die gesamte Vorbereitung an den ursprünglichen
Runtimezyklus, Ownerdatensatz, dessen Generation und Projektkontext. Nach jeder
Membershipantwort und vor jeder Folgeseite wird diese Bindung geprüft. Flag-off,
Off/On, Unmount und eine neue Ownergeneration beenden die alte Vorbereitung.
Ein erfüllter No-op-Read kann deshalb keine deaktivierte Promise-Schleife erzeugen.

Die Vorbereitung verlangt zusätzlich tatsächlichen Seitenfortschritt: kein erneut
besuchter Cursor, wachsende vollständige Mitgliedsmenge und eine zentrale Obergrenze.
Fehlender Fortschritt endet mit sichtbarem PROTOCOL_MISMATCH. Vollständige aktuelle
Pinmengen, echte aktuelle HTTP-Fehler und die vorhandenen CAS-/Reordergrenzen bleiben
erhalten. Es wird keine Mutation automatisch wiederholt.

Sechs neue dauerhafte Fälle in `organization-pin-lifetime.test.ts`:
Flag-off vor jeder deaktivierten Iteration; geschlossener Owner bei weiter aktivem
anderem Owner; neue Ownergeneration; wechselnde Cursor ohne Mengenfortschritt;
korrekte 101-Pin-Pagination samt HTTP-Fehler; legitimer zweiter Owner nach Abbruch
des ursprünglichen Besitzers einer geteilten Membershiplesung.

## R4-M1: zusammengesetzte Readketten behalten ihren Anfangskontext

`organization-runtime.ts` bietet eine kleine interne capture-Prüfung: ursprünglicher
Zyklus und Abortsignal, optional zusätzlich Owneridentität, Generation und Projekt.
Sie startet keinen Lifecycle. Queries und Aktionen erfassen diese Prüfung vor dem
ersten Await; untergeordnete Reads bekommen die weiter gültige Bindung übergeben.
Eine Fortsetzung kann veraltete Arbeit damit nicht als neuen Zyklus übernehmen.

`organization-queries.ts` bindet Metadaten und Lookup über alle Batches an ihren
ursprünglichen Zyklus und ihr ursprüngliches Signal. Wartende Fresh-Metadaten prüfen
nach await existing erneut, bevor sie den ausdrücklich gewünschten frischen GET
starten. Auch zwischen weiteren 100er-Batches findet diese Prüfung statt.
Die Singleflight-Identität ist jetzt JSON.stringify der sortierten IDs statt einer
Trennzeichenverkettung. Bereits gestartete geteilte Metadatenrequests bleiben an
ihren ursprünglichen Runtimezyklus gebunden.

`flushInvalidations` prüft nach Metadaten und vor Lookup sowie nach Lookup, bevor
Kandidaten/Views aktualisiert werden. Die alte Warteschlange lädt im neuen Zyklus
keine alten IDs nach. Native Summary plus gleichzeitige Invalidierung benutzt
denselben begrenzten Pfad; es entsteht keine neue Pollschleife.

Sidebar-refresh prüft nach Katalog, zwischen allen Membershipreads und vor Notices.
Der interne Katalogaufruf meldet, ob seine Projektion tatsächlich gültig angewandt
wurde; abgebrochene/ersetzte Kataloge beenden die Kette. Zusätzlich bleibt Refresh
an seine eigene Querygeneration gebunden. Diese interne Rückgabe ändert keine
öffentliche UI-/Hook-API.

Membershipketten prüfen vor ihrem Summarylookup weiter. Catch/Finally und wartende
Resets erhalten die bisherigen Zyklusgrenzen. Ein aktiver Runtime darf nach Ende
eines abgebrochenen Ownerreads seinen aktuellen Ladezustand aufräumen; ein anderer
gültiger wartender Owner kann die noch ungefüllte Mitgliedschaft dann selbst lesen.
Alte Fehler ändern weder den neuen Owner noch einen neuen Runtimezyklus.

Mutationsantworten behalten ihre bestehende sichere Behandlung: kein Retry.
Ein legitimer bereits ausgeführter Effekt darf im selben Runtime geteilt werden;
Undo und anschließender Summaryread verlangen weiter den ursprünglichen gültigen
Owner. Auch sichtbare Read-ACK-Ketten prüfen vor/nach Metadaten und bei erneuter
Projektion ihre gültige Read-/Ownergeneration. Kein automatisches ACK neuer Belege.

30 neue dauerhafte Fälle in `organization-read-lifetime.test.ts`: je 13 benachbarte
Promisegrenzen für wartende Freshreads und Invalidierung→Lookup, Refreshabbruch nach
Katalog oder Membership, neuere Suchgeneration, native Summary plus Invalidierung,
gültiger Freshread und Abbruch einer ownergebundenen Lookup-Batchkette.

## Dateien und Prüfungen

Produktänderungen nur unter `apps/web/src/components/hermes/v2/`:
`organization-actions.ts`, `organization-queries.ts`, `organization-runtime.ts`,
`chat-read-evidence.ts`; zwei neue fachliche Lifetime-Testdateien.

- 214/214 Featuretests in 19 Dateien grün: sämtliche 178 Bestandsfälle einschließlich
  aller 88 Phase-3-Fälle und aller R1/R2/R3-Autorenregressionen plus 36 neue Fälle.
- Unveränderte externe 88/88 Fälle grün, einschließlich aller sieben Reprodateien.
  Kommando: `pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
- Gezieltes ESLint mit `--max-warnings=0` grün.
- Vollständiges `pnpm typecheck` einschließlich Contracts, Server, Web und E2E grün.
- `pnpm architecture:file-lines` grün; alle eigenen Dateien unter 400 Zeilen.

Keine UI-/Server-/Contracts-/Root-E2E-Änderungen, Browser, Dienste, echten Requests,
Commits oder zusätzlichen Agents. Gesamtversionierung bleibt gemäß Teilauftrag
bei Root. Keine Phase-5-Arbeit begonnen.
