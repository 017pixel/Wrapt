# Phase 4: Clientkorrekturen nach unabhängigem Gate

Stand: 16.10.2026. Die vier Medium-Befunde aus
`hermes-v2-phase4-client-gate.md` sind im Autorenscope korrigiert.
Scope erneut eingefroren. Frischer unabhängiger Recheck bleibt erforderlich;
dieser Bericht erklärt weder das Clientgate noch Phase 4 insgesamt bestanden.

## M1: frischer Beleg auf älterer Historyseite

`chat-messages.ts` ergänzt `olderHistory`; `chat-state.ts` verwendet diese
Projektion für Offset > 0. Bereits bekannte Rows behalten ihre Position, erhalten
aber vollständig die frisch angefragte autoritative Row einschließlich Text und
Beleg. Tatsächlich zusätzlich geladene ältere Rows werden davor eingeordnet.
Identität bleibt ausschließlich ID/Row-ID/logische ID; kein Textdedupe und kein
Übertragen eines alten Handles auf andere Inhalte. Bestehende Owner-/Session-/
Snapshotbarrieren der Historyrequests bleiben unverändert.

Eigene Regression in `chat-read-evidence.test.ts`: Seite 0 und echte ältere Seite
mit Offset 1 laden; Read(A) läuft ab; dieselbe Row kommt mit neuer Projektion und B
zurück. Reihenfolge und Offset bleiben korrekt, B wird übernommen. Vor erneutem
sichtbarem B-Callback bleibt es bei einem POST/read, danach sind es genau zwei.

Der externe M1-Test enthielt ursprünglich nach diesem ausdrücklichen B-Callback
noch die widersprüchliche Erwartung von insgesamt einem Read. Root hat genau diese
Zählung auf vor B=1 und nach B=2 korrigiert und für den unabhängigen R2-Recheck
dokumentiert. Ich habe keine externe Reprodatei geändert.

## M2: bekannte Membership-Summaries und Activity erneuern

`organization-queries.ts` unterscheidet fehlenden Backfill von explizitem Refresh
über `lookup(ids, refresh)`. Jede tatsächlich geladene Membershipseite erneuert ihre
bekannten IDs begrenzt; `metadata.invalidated` verwendet denselben Refreshpfad in
`organization-runtime.ts`. Lookup bleibt in 100er-Batches, mit Abort-/Cycle- und
nativer Beobachtungsbarriere. Keine zusätzliche Chatlease, kein Resume/status und
keine automatische Katalogvollsuche oder Pollschleife.

Zwei eigene Regressionen laden ein altes Pinmitglied jenseits der ersten 100
Katalogrows und ändern anschließend Titel/Activity auf einen belegten wartenden
Zustand. Expliziter Sidebarrefresh und Metadata-Invalidierung zeigen beide den
neuen Titel und Needs input; das alte Mitglied erhält kein Chatabo.

## M3: echte native Änderungen getrennt erkennen

`organization-runtime.ts` merkt den zuletzt tatsächlich konsumierten nativen
Chatlistenstand in einer eigenen Map. Vergleichsbasis ist dieser native Stand,
nicht der durch REST aktualisierte gemeinsame Summarycache. Die Map folgt der
bereits begrenzten Chatliste und wird bei Dispose geleert.

Nur neue native Objektbeobachtungen erhalten eine native Beobachtungsrevision.
Die bisherige Barriere gegen einen älteren, verspätet eintreffenden RESTread bleibt
erhalten. Eigene Regression: A=Alt aus Snapshot, danach A=Neuer aus REST, dann nur
B nativ hinzufügen. A bleibt unverändert und genau eine neue Beobachtung entsteht.
Eine anschließende echte native Umbenennung von A wird weiterhin übernommen.

## M4: erfolgreiche Reorderantwort an komplette Zielmenge binden

`organization-client.ts` prüft vor Rückgabe erfolgreicher Reorderantworten:
eindeutige Request- und Response-IDs, gleiche Anzahl und exakt gleiche ID-Menge.
Reihenfolge der Responseitems ist frei. Fremde, fehlende, zusätzliche oder doppelte
Items ergeben `PROTOCOL_MISMATCH` mit `outcome: unknown`, bevor Metadaten oder Undo
übernommen werden. Kein automatischer Mutationsretry.

Strukturierte 409-Konflikte werden vorher separat verarbeitet und dürfen weiterhin
die inzwischen veränderte aktuelle Pinmenge enthalten. Undo bleibt unverändert.
Der alte zu permissive Positivtest wurde durch eine vollständige passende Zielmenge
ersetzt. Eigene Regressionen prüfen den echten Sidebaraktionspfad, unveränderte
fremde Metadaten/Undo, genau einen Send, fehlende/doppelte/fremde/zusätzliche Items
und eine zulässige abweichende Konfliktmenge.

## Änderungen und Prüfungen

Produktdateien: `chat-messages.ts`, `chat-state.ts`, `organization-queries.ts`,
`organization-runtime.ts`, `organization-client.ts` unter dem bestehenden
Webfeatureverzeichnis `apps/web/src/components/hermes/v2/`.
UI-API und öffentliche Contracts bleiben unverändert.

Eigene Tests: neue `organization-client-fixes.test.ts` mit fünf Fällen, ein neuer
Offset-1-Readfall in `chat-read-evidence.test.ts` und angepasster positiver
Reordervertrag in `organization-client.test.ts`.

- 144/144 Tests in 14 fachlichen Featuredateien grün, einschließlich aller 88
  Phase-3-Regressionen und aller bisherigen Phase-4-Fälle.
- Externe 13 Repros grün: `pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
- Gezieltes ESLint aller nonvisuellen Module/Tests mit `--max-warnings=0` grün.
- Vollständiges `pnpm typecheck` einschließlich Contracts, Server, Web und E2E grün.
- `pnpm architecture:file-lines` grün; alle eigenen Dateien unter 400 Zeilen.

Keine UI-/Server-/Contracts-/Root-E2E-Änderungen, Dienste, Browser, echten Requests,
Commits oder zusätzlichen Agents. Versionierungen bleibt bei Root für die gesamte
Featureintegration. Keine Phase-5-Arbeit begonnen.
