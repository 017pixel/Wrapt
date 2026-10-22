# Phase 7: Antwort auf Clientgate M1/M2/L1/L2

Stand 17.10.2026. Alle vier Ursachen im autorisierten nicht visuellen Scope
korrigiert. Code und Tests erneut eingefroren. Dies ist der Autorenbericht,
kein unabhängiges R2-Gate und keine UI-/Backend-/Browser-/Gesamtfreigabe.

## M1: monotone CWD-Beobachtungsbarriere

`chat-state.ts` hält die interne cwdRevision. `chat-events.ts` erhöht sie bei
jedem tatsächlich beobachteten CWD-Wechsel eines akzeptierten session.updated.
Gleichlautende Infos erhöhen sie nicht; A→B→A erhöht sie zweimal.
`chat-work-context.ts` bindet jeden Capture zusätzlich an diese Revision und
prüft sie vor und nach Awaits. Der wieder gleiche Endstring autorisiert keine
alte Fortsetzung. Snapshotgeneration, Owner-/Dokument-/Flag-/Socket-/Connection-/
Abo-/Epochengrenzen bleiben erhalten.

Ein tatsächlicher CWD-Wechsel entwertet außerdem Roster-/Queuebeobachtung und
beendet den alten Loadingstand. `chat-runtime.ts` veranlasst einen begrenzten
neuen Workread im aktuellen sichtbaren Kontext. Ein alter laufender Read bleibt
reserviert, seine Antwort wird verworfen und erst danach folgt der neue Abgleich.
Keine Mutation wird nachgesendet. Tail nach Kontextverlust bleibt not_sent,
ein möglicherweise gesendeter Write unknown.

## M2: Queueeintrag nach Kontextverlust ehrlich abschließen

`chat-work-actions.ts:confirm` finalisiert einen noch vorhandenen alten Eintrag
bei ungültigem Capture ausdrücklich als unknown statt still zurückzukehren.
Die Pendingmarkierung endet, derselbe neue bewusste Queuewunsch ist wieder
möglich. Automatischer Retry fehlt weiterhin. Bereits durch einen stärkeren
Owner-/Snapshotwechsel entfernte lokale Einträge werden nicht wieder eingesetzt.

Die Finalisierung wirft keinen Fehler in den unabhängigen Submitreceiptpfad.
Damit bleiben konkrete Optimistikentfernung, nachgewiesene Userrow-/Dateikorrelation
und der Erhalt eines neueren Drafts beziehungsweise neu angehängter Dateien
intakt. Queuekopf und Quittung bleiben getrennt; Kopf nur aus Snapshot/work.read.

## L1: Readreservierung vor jeder synchronen Benachrichtigung

`chat-work-reads.ts` trägt die gemeinsame Readreservierung samt Abschlussversprechen
ein, bevor loading im Store erscheint oder Ownerlistener benachrichtigt werden.
Reentrante Owner- und Sessionlistener erhalten dieselbe offene Reservierung.
finally gibt Reservierung und Versprechen auch nach Fehler/Dispose frei.
Ein zusammengefasster Folgeabgleich bleibt möglich; kein zusätzlicher Vollread
läuft für dieselbe Sitzung gleichzeitig.

## L2: lokalen Belegverlust als gekürzte Sicht kennzeichnen

`chat-work-state.ts` begrenzt Patch- und Startreceiptlisten gemeinsam.
Wenn tatsächlich eine Zeile das lokale Hundertzeilenlimit überschreitet,
wird vorhandene coverage.truncated auf true gesetzt. Kinder, beide
Delegationsidentitätsteile und Background-/Btw-Aufgaben verwenden denselben Pfad.
Identische Zeilenupdates am exakten Limit setzen keinen falschen Kürzungshinweis.
Servertruncation bleibt erhalten; nur ein neuer vollständiger Roster ersetzt
die Abdeckungsbeobachtung. Vor dem ersten Roster bleibt coverage unbekannt.
Verschwinden wird weiterhin nicht als erfolgreicher Abschluss interpretiert.

## Regressionen und tatsächliche Prüfungen

Gate und alle fünf unabhängigen Testdateien samt Fixture vollständig gelesen.
Vor Fix unverändert reproduziert: **144 grün, 13 rot**. Danach dieselbe originale
Suite **157/157 grün**: M1 neun, M2 zwei, L1/L2 je eine rote gesunde Assertion
geschlossen. Keine fremde oder frühere Testassertion geändert.

Zwei neue dauerhafte Testdateien, zusammen **31 Fälle**:

- chat-work-context-barriers.test.ts: alle sieben Actions vor/nach echten
  Live-CWD-A→B→A-Infoevents, stale Roster/Tail, unveränderte Infos, neuer bewusster
  Wunsch, Queueunknown ohne Retry sowie gezielte Userrow-/Optimistikkorrelation.
- chat-work-read-bounds.test.ts: reentrante Owner- und Sessionlistener,
  Reservierungsfreigabe nach Readfehler, sämtliche Patchdomänen, Startreceipts,
  exaktes Limit, Servertruncation und unbekannte Abdeckung vor erstem Roster.

| Prüfung | Ergebnis |
| --- | --- |
| Nonvisuelle Featuresuite, 43 Dateien | **577/577**, bisherige 546 unverändert |
| Unveränderte unabhängige Phase-7-R1-Suite | **157/157** |
| Externe Phase 4 | **172/172** |
| Externe Phase 5 R1/R2 | **30/30**, **38/38** |
| Externe Phase 6 R1/R2 | **93/93**, **79/79** |
| Scoped TypeScript einschließlich eigener und unabhängiger Repros | grün |
| Scoped ESLint sämtlicher chat-/gateway-Module und Chathook samt Tests | grün |
| Separates pnpm typecheck:e2e | grün |
| pnpm architecture:file-lines | grün |

Jede externe Suite benutzte ihre ursprüngliche Vitestconfig. Der Scoped-Typlauf
übernimmt unveränderte Webcompileroptionen und ergänzt nur die beiden neuen Tests.
Logs/Config liegen unter `temp/hermes-v2/phase7-client/`, Fixläufe beginnen dort
mit fixes-. Vollständiges pnpm typecheck ausgeführt: Extensioncontracts,
Contracts und Server grün; Web scheitert ausschließlich an paralleler fremder
HermesV2ChatSurface.tsx:133 (queuedShown unbenutzt) und :201 (queued undefiniert).
Keine nicht visuellen Typfehler. Root besitzt den integrierten grünen Lauf.

## Freeze und Grenzen

Genau sieben Produktdateien gegenüber R1 geändert: chat-state/events/runtime,
chat-work-context/actions/reads/state. Zwei neue Regressionstestdateien.
Alle alten eigenen Tests/Fixtures und externe Repros unverändert. Der Vergleich
der 38 historischen externen Code-/Config-/Fixturedateien ist **38/38 exakt**.
Neuer Freeze: `temp/hermes-v2/phase7-client/fixes-code-freeze.json`, **94 Dateien**.
Alter R1-Codefreeze und alte Berichte bleiben als historische Belege unverändert.
Alle eigenen Dateien liegen unter 400 Zeilen, keine breite Formatierung.

Keine API-, UI-/CSS-, Server-/Contracts-, Organisations- oder Root-E2E-Änderung.
Keine weiteren Agents, echten Core-/CLI-/HTTP-/Nutzerdaten-, Browser-, Dienst-,
Git-, Preview- oder Slotaktionen. Testfakes/Runtime werden disposed, kein
automatischer Mutationsretry. Partielle Reconnectabdeckung, next-only Queue und
fehlender garantierter StopTree bleiben die zuvor dokumentierten Grenzen.
Root verantwortet unabhängiges R2, UIintegration, Browserbelege und Versionierung.
