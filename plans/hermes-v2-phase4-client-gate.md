# Hermes V2: unabhängiges Phase-4-Client-Gate

Stand: 16.10.2026. **Urteil: needs fixes. Vier offene Medium-Findings.**
Fünf unabhängig ausgeführte Gegenfälle belegen diese vier Ursachen.
Keine konkret nachgewiesenen High-Findings. Kein Gesamtfeature-, Backend- oder UI-PASS.

## Prüfgrenze

Geprüft sind sidebar-types/resolver/dnd/time/preferences/empty, organization-client/
response/policy/owner/state/queries/actions/runtime, useHermesV2Sidebar,
chat-read-evidence und die nötigen Chat-/Store-/Owner-/Gatewayänderungen samt Tests.
Grundlagen: Originalbrief insbesondere Kapitel 5, 11 bis 13, Phase 4, Tests und DoD;
organisation-handoff, evidence-gate-r4, phase4-interface-decisions und
phase4-web-implementation. Die jüngsten Interfaceentscheidungen haben Vorrang.
Phase-3-Clientgates R1/R2/R3 und Autorenfixes wurden berücksichtigt.

Server/Contracts wurden ausschließlich zum Verständnis gelesen. Keine Servertests
oder Backendfreigabe. GLM-Komponenten, CSS und reale Observer-/Browserintegration
bleiben außerhalb dieses Gates. Keine Dienste, Browser, Ports, Nutzerpreviews,
Nutzersessions, echten Coremutationen, Commits, Pushes oder weiteren Subagents.
Keine Produktdateien geändert. Einziger dauerhafter Bericht ist diese Datei;
eigene Repros und Prüfausgaben liegen unter `temp/hermes-v2/phase4-client-review/`.

## M1: ältere Historyseiten behalten abgelaufene Read-Belege

**Severity: Medium. Ort:** `chat-state.ts:68`, aufgerufen durch
`chat-actions.ts:71` und `chat-read-evidence.ts:104` im genannten Featureverzeichnis.
Repro: `temp/hermes-v2/phase4-client-review/edges.test.ts:28`.

Über die echte loadOlder-Aktion zunächst Seite 0 und dann Seite mit Offset 1 laden.
Die ältere Assistantrow besitzt Handle A. Sichtbarer Read(A) erhält
READ_EVIDENCE_EXPIRED; der folgende echte history.read derselben Seite liefert
dieselbe vollständig dargestellte Row mit frischem Handle B.
Erwartet: B ersetzt den alten Beleg, erst ein neuer Sichtbarcallback darf B bestätigen.
Ist: applyChatHistory führt bei offset > 0 `mergeMessages(incoming, state.history)`
aus. Die alte History gewinnt und überschreibt B wieder mit A. A bleibt blockiert,
B gilt lokal als nicht angewandt. Auch ausdrückliches readView.refresh behebt das
nicht; der Repro bestätigt weiterhin genau einen gesendeten Read.

Fixrichtung: eine tatsächlich erneuerte ältere Projektion samt Beleg übernehmen,
ohne Belege von anderem Inhalt oder entwerteten Generationen zu übertragen.
Regression für Offset > 0 ergänzen; der bisherige TTL-Test prüft nur Offset 0.

## M2: bekannte Membership-Summaries und Activity werden nicht erneuert

**Severity: Medium. Ort:** `organization-queries.ts:102`; Aufrufer :92 sowie
`organization-runtime.ts:160`. Repros: `edges.test.ts:45` und `:79`.

Eine alte Pin-Sitzung außerhalb der ersten 100 Katalogrows wird einmal per Lookup
mit Titel Vorher und Activity idle geladen. Die Quelle ändert Titel auf Nachher
und Activity auf waiting_input. Anschließend vollständiges Sidebar-refresh ausführen.
Erwartet: begrenzten Summary-/Activityread für dieses bekannte Mitglied durchführen,
Titel aktualisieren und den belegten offenen Request in Needs input zeigen.
Ist: Lookup filtert alle bereits gecachten IDs aus. Membership-Refresh lädt nur
OrganizationViews; der Katalogrefresh liest erneut ausschließlich die erste Seite.
Die alte Sitzung bleibt Vorher/idle/Pinned. Ein zweiter Repro bestätigt denselben
Fehler bei metadata.invalidated für die bereits bekannte Sitzung ohne Chatabo.

Das ist keine bloße Grenze noch ungeladener Katalogseiten: die konkrete ID ist
bekannt und ausdrücklich erneut angefragt. Die OrganizationView enthält keine
Requestzahl, weshalb veraltete Activity echten Needs-input-Vorrang verhindert.
Fixrichtung: an diesen Anlässen bekannte betroffene IDs begrenzt mit aktualisieren;
Missing-only-Lookup zum Backfill von einem tatsächlichen Refresh unterscheiden.

## M3: unveränderte Chatlistenrows setzen neuere REST-Summaries zurück

**Severity: Medium. Ort:** `organization-runtime.ts:104` bis :107.
Repro: `edges.test.ts:59`.

A zunächst per Chatsnapshot mit Titel Alt laden. Ein späterer REST-Katalogrefresh
zeigt korrekt Neuer aus REST. Danach ausschließlich B über upsertSummary anlegen.
Es gibt kein neues A-Ereignis und keinen neuen A-Snapshot.
Erwartet: A behält den neueren REST-Stand, nur B wird als native Änderung übernommen.
Ist: chatSummaries vergleicht alte Chatlistenobjekte mit dem inzwischen durch REST
ersetzten gemeinsamen Cache. Das unveränderte alte A-Objekt gilt als geändert,
erhält eine neue native Beobachtungsrevision und überschreibt A wieder mit Alt.

Fixrichtung: tatsächlich neu beobachtete native Rows gegenüber dem zuletzt
konsumierten nativen Stand erkennen. Der gemeinsame REST-Cache ist dafür keine
geeignete Vergleichsbasis. Die vorhandene Barriere gegen einen verspäteten alten
REST-Read nach einer echten nativen Umbenennung muss erhalten bleiben.

## M4: erfolgreiche Reorderantwort ist nicht an die Zielmenge gebunden

**Severity: Medium. Ort:** `organization-client.ts:103` bis :105 und
`organization-actions.ts:78`. Repro: `edges.test.ts:68`.

Vollständige Pinmenge ist ausschließlich A, B ist eine geladene ungepinnte Sitzung.
Ein zulässiger Reorder sendet entries=[A]. Die formal schemagültige HTTP-200-Antwort
liefert ausschließlich OrganizationView(B) mit pinRank=0 und höherer Revision.
Erwartet: PROTOCOL_MISMATCH, Ausgang unknown, keine fremde Metadatenübernahme,
keine automatische Wiederholung. Ist: kein Fehler, B wird im gemeinsamen Cache
gepinnt. Der Repro prüft den echten Sidebaraktionspfad einschließlich lokaler CAS-Prüfung.

Dies belegt eine fehlende Client-Protokollgrenze, keinen nachgewiesenen realen
Cross-Owner-Datenleak. Der Serververtrag gibt bei erfolgreichem Reorder die
betroffenen vollständigen Pins zurück; deren ID-Menge ist dem Client bekannt.
Fixrichtung: erfolgreiche Antwort auf eindeutige vollständige Zielmenge prüfen.
409 darf weiterhin eine inzwischen veränderte aktuelle Pinmenge zurückliefern.
Der bestehende Clienttest akzeptiert ausdrücklich entries=[] mit items=[A,B]
und muss durch passende positive und negative Vertragsfälle ersetzt werden.

## Selbst ausgeführte Checks und erhaltene Schutzgrenzen

- Gezielte 13 vorhandene Feature-Testdateien: **138/138 grün**, einschließlich
  aller 88 Phase-3-Regressionen. Der frühere R3-PASS wird dadurch nicht widerrufen.
- Eigene 13 Fälle: **8 grün, 5 rote gesunde Erwartungen**, zu den vier Findings.
  Ausführung: `pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
  Ausgabe: `temp/hermes-v2/phase4-client-review/results.txt`.
- Eigene grüne Fälle bestätigen bekannte ungelesene Antworten bewusst organisierbar,
  offene Requests vorrangig, Live-Request ohne Zusatzabo, hängendes Read A mit
  gleichzeitigem Batch B und nachgereichtem B2, spätes Mutationsergebnis nach
  Flagwechsel ohne Leak/Retry, echte native Umbenennung gegen alte REST-Antwort,
  ehrliches 5000er-Suchlimit und weiterhin gebundene Einzelaktions-/Metadatenantworten.
- Gezieltes ESLint sämtlicher geprüfter Sidebar-/Organisation-/Chat-/Gateway-/
  Hookmodule und zugehöriger Tests mit `--max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün, auch nach Hinzufügen dieses Berichts.
  Eigene handgeschriebene Reprofile bleiben jeweils unter 400 Zeilen.
- Abschließender `pnpm typecheck`: grün, einschließlich Contracts, Server, Web
  und E2E-Typen. Der zwischenzeitliche parallele UI-Testfehler ist korrigiert.

Die Bestandsfälle für Streamgrenze, gemeinsame Uhr/Undo, 101 Pins bei Suchfilter,
Invalidierung während GET, StrictMode und sichtbare exakte Readmengen bleiben grün.
Die vier obigen Gegenfälle sind dadurch nicht abgedeckt. Nach Korrektur ist ein
frischer unabhängiger Recheck erforderlich; Browserbelege bleiben beim Root.
