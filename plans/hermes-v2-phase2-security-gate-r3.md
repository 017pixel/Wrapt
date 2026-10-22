# Hermes V2 Phase 2: unabhängiges Security-Gate R3

**Entscheidung: PASS für das Phase-2-Sicherheitsgate. Keine offenen High-/Medium-Befunde.**
Der Parent darf die App-Registrierung vorbereiten und den separat vorgesehenen
echten Smoke mit einer eigenen Testsession durchführen. Dieses PASS belegt keine
echte Hermes-Runtime-Kompatibilität und keine Freigabe des Gesamtprodukts.

Stand: 16.10.2026. Neue unabhängige Runde im geteilten Checkout.
Geprüft: alle neuen Backendmodule und Tests unter `apps/server/src/hermes/v2/`,
alle sechs `packages/contracts/src/hermes-v2*.ts`, Package-Subpath,
Versionsstände und neuer Contracts-Changelog. V1/ACP bleibt erhalten.
Phase 1 ist laut Auftrag abgeschlossen; Client/UI Phase 3 ist nicht Gegenstand.

Grundlage: Originalattachment, `hermes-v2-inventory.md`,
`hermes-v2-protocol-research.md`, `hermes-v2-backend-handoff.md`,
`hermes-v2-phase2-security-gate.md`, `hermes-v2-phase2-security-fixes.md`,
`hermes-v2-phase2-security-gate-r2.md` und der erst nach eigener Prüfung der
betroffenen Produktpfade gelesene `hermes-v2-phase2-security-fixes-r3.md`.
Installierte Hermes-Quelle nur gelesen: Commit
`07908be267f54f498230b3aae0f27c3f27d8c973`, Desktop-Vertrag 8.

## H1 High: vollständig geschlossen

Die ursprüngliche Principal-Lücke bleibt geschlossen: `pool.ts:18` und `:32`
teilen die flüchtige Secretkenntnis; Managerentsorgung entfernt keine bekannten
Werte. Getrennte Streamkanäle und Kapazitätsablehnung vor Claim/Send bleiben erhalten.

Die in R2 verbliebene JSON-Escaping-Lücke ist ebenfalls geschlossen:
`secret-redactor.ts:14` registriert Rohwert und kanonischen JSON-Stringinhalt
atomar, für Vault einschließlich Passwortteil. `normalize-values.ts:24`
maskiert strukturierte Inhalte vor der Serialisierung. Aufrufer in
`normalize-events.ts:52`, `normalize-history.ts:25`/`:68` und
`snapshot-tools.ts:33`/`:45` verwenden denselben Redactor.

Beide Schutzebenen unabhängig geprüft: direkter `jsonText`-/History-/Replay-Aufruf
ohne finale Browserprojektion sowie bereits serialisierte Inhalte ausschließlich
über die finale Projektion. Verschachtelte Werte, Arrays, Objektschlüssel und
JSON-Strings mit Quote, Backslash und Newline ergeben nach `JSON.parse` `***`.
Rohwert und kanonische Variante bestehen jede einzelne Chunktrennstelle.

Zwei echte Manager am isolierten Fake-Core bestätigen Secret- und Vault-Antwort
über A, maskierte Toolinputs/-outputs sowie fragmentierten Text und Reasoning
bei A und B. History und frischer Snapshot nach Entsorgung beider Manager bleiben
maskiert. Mengen- und Bytekapazität nehmen keine halbe Variantenmenge auf;
vorhandene Fake-Regressionen bestätigen Ablehnung ohne Claim oder Send.
Keine Behauptung zur Erkennung beliebiger externer Secrettransformationen.

## M3 Medium und Parent-Kurzsecret-Befund: geschlossen

`secret-redactor.ts:48` berechnet Ersatz und zurückzuhaltenden Präfix auf dem
vollständigen Inhalt und begrenzt erst danach die sichtbare Ausgabe.
`redact-browser.ts:37` hält nach der finalen Inhaltsprojektion zusätzlich die
gemeinsame Vertragsgrenze `HERMES_V2_TEXT_MAX_LENGTH = 200_000` ein.

Eigene Gegenbeispiele: Text und Reasoning mit jeweils 200.000 Zeichen bei
Secrets `a`, `once`, `event`, jeweils zwei Principals. Dazu zurückgehaltener
`R3_LONG_`-Präfix vor 200.000 anderen Zeichen und anschließend erneut ein über
zwei Chunks geteiltes vollständiges Secret. Jeder Eingangsframe ergibt einen
gültigen Event, mit exakt erwarteter Sequenz, Epoche und Session-ID.
Kein `PROTOCOL_MISMATCH`; das spätere Secret bleibt vollständig maskiert.

UUID-Korrelation, Discriminators, Status, Session-/Tool-/Request-IDs,
Approval-Choices, Modell-/Providerkennungen und `logicalId` bleiben erhalten.
Die bewusste Inhaltsbegrenzung kann bei Maskenexpansion oder nachgeholtem
Präfix sichtbaren Überschuss abschneiden. Sie erzeugt keine zusätzliche Sequenz
und verliert keinen Event durch einen erst vom Filter erzeugten Schemafehler.

## Parent-History-Befund Medium: geschlossen

Der exakte Reproducer mit zwei Assistant-/Result-Paaren und derselben
Provider-ID `call-1` liefert beide richtigen Input-/Outputpaare, richtige
Ergebnis-Row-IDs und eindeutige Karten-IDs. Kein altes Result wird überschrieben.

`history-identities.ts:10`, `normalize-history.ts:27` und `:51` verwenden echte
32-Hex-`tool_call_uid(s)` als Vorkommenszeugen. JSON-Spaltentext, Map und
UID-Arrays bei wiederholter Provider-ID wurden unabhängig geprüft, auch bei
umgekehrter Ergebnisreihenfolge, getrennten Seiten und echten UID-Kopien mit
anderen physischen Row-IDs. Dieselbe belegte Karte behält ihre Adresse.

Legacy-Fallback bleibt im Assistant-Scope; fehlende, widersprüchliche oder
mehrdeutige Zuordnung verbindet keine fremden Inputs. User-, Hidden- und
unbekannte Rollengrenzen lösen den Legacy-Scope. Resultate ohne Callseite
behalten unbekannten Input. Gleicher Text ist kein Identitätsbeweis.

`snapshot-tools.ts:9` überschreibt History niemals nur über Provider-ID.
Eigene Kontrollen trennen Epoch, Live-ID, Turnstart und Toolstartsequenz.
Orphan-Complete und mehrdeutige Starts schreiben keine alte History um;
beendete Turns und bestätigte Idle-Snapshots behalten nur History.
Ohne tatsächlichen Occurrence-Crosswalk dürfen History und laufendes Replay
getrennte Belege liefern; der spätere Client darf diese nicht per Text falten.

Quellabgleich: Hermes `hermes_state_messages.py:1319` liefert die gespeicherten
Identitätsspalten; `hermes_cli/web_routers/sessions.py:655`/`:724` bewahrt sie in
der Historyprojektion. `hermes_state_identity.py:28` und
`agent/message_metadata.py:141` bestätigen die UID-Map-/Listenformen.
Tool-Liveevents enthalten laut `tui_gateway/contracts/events.py:266`/`:283`
weiterhin nur Provider-IDs und keinen solchen SQLite-Zeugen.

## Bereits in R2 geschlossene Befunde: weiterhin geschlossen

H2 High: konkrete `ownedBinding(epoch, liveId)` und unbekannte Runtime bis
Settlement bleiben bestehen (`manager.ts:60`/`:294`, `session-service.ts:83`).
Erneuter eigener Fake-Lauf: Create/Submit, neuer Epoch mit fremdem True-Flag,
V2 aus, Hauptturnabschluss und danach Subagentabschluss. Socket erst nach beiden
Abschlüssen entsorgt, kein Stop/Close. Vorhandener Classic-Socket-Test besteht.
Installierte Quelle bestätigt die zugrunde gelegte Disconnect-Semantik weiterhin.

M1 Medium: Claimtoken, Transportende und autoritativer Open-Abgleich bleiben
erforderlich (`request-registry.ts:80`, `manager.ts:164`, `upstream.ts:238`).
Erneut geprüft: verlorene Antwort, gleicher Epoch, bewusster Neuversuch;
kein automatischer Retry, kein Lösen eines aktiven fremden Claims,
Classic-Settlement bleibt stale und parallele Principals senden einmal.
Die vorhandene Regression gegen verspätetes Unlock eines alten Tokens besteht.

M2 Medium: letzter synchroner Sendguard bleibt erhalten (`manager.ts:122`,
`operations.ts`, `session-service.ts:40`/`:76`). Erneut 36 eigene Kontrollen für
Submit/Stop/Steer/Model/Response/Lock bei REST- und letztem RPC-Preflight,
je Release, Navigation und Flag-off. Dazu Create-CWD, Create-Katalog und
Resume-Lineage. Kein neuer Mutationssend/Claim, keine bereits laufende Arbeit
gestoppt. Bestehende Abo-, Live-ID- und Epochwechseltests bestehen.

## Weitere Grenzen, Vertrag und Prüfungen

Identität und Same-Origin stehen vor Upgrade. Browserframes bleiben strikt;
keine freie RPC-/Shell-/Config-/Profil-/Skill-Expansion gefunden. Token bleibt
serverintern. Exakte Stored-/Live-Zuordnung, realpath-CWD vor/nach Resume und
vor Mutation sowie Choice-/QID-/Lock-Prüfung bleiben erhalten. Snapshot-/Replay-
Klammer, Sequenz-Dedupe und Verzicht auf Mutationretries bleiben bestehen.
Ressourcen-, Payload-, Timeout-, Heartbeat- und Cleanup-Grenzen sind vorhanden.
Flag-off/Navigation senden kein Close/Interrupt fremder Arbeit.

`logicalId` ist optional/nullable und projiziert ausschließlich eine tatsächlich
valide ursprüngliche `message_uid`. Fehlende/ungültige IDs werden null;
identischer Text wird nicht dedupliziert, Kopien behalten denselben Zeugen.
Alte Objekte ohne Feld bleiben gültig, zusätzliche Credentialfelder ungültig.
Contracts-Subpath und alle Typaufrufer sind konsistent. Contracts **0.19.0** samt
Paket-Changelog, Root/Server/Web **2.9.0**. Kein alter Barrel oder V1/ACP verändert,
keine historische Dateilängenbaseline erhöht. App weiterhin nicht registriert.

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 19 Dateien,
  **162 Tests grün**, davon 112 V2 und 50 bestehende Hermes-Tests.
- Eigene neue `independent.ts`: **15 Prüfgruppen grün**, zusätzlich die aus R2
  übernommenen, auf korrektes Verhalten gerichteten `regressions.ts`: **52 grün**.
  Repros und Ergebnisse: `/tmp/hermes-v2-security-r3.19wxdbbk/`.
  Ausführbar mit `pnpm --filter @wrapt/server exec tsx <absoluter Skriptpfad>`.
- `pnpm typecheck`, gezielter ESLint mit `--max-warnings=0`,
  `pnpm architecture:file-lines` und Scope-`git diff --check` erfolgreich.
  Größtes neues Backendmodul 362 Zeilen. Scope-Produkt-Hashes unverändert.

Einzige neue Projektdatei dieses Reviews ist dieser Bericht. Nur temporäre
Fake-Gegenbeispiele und eigene OS-zugeteilte Loopback-Testports verwendet und
entsorgt. Kein Browser, echter Hermes-Request/-Turn/-Session, Dienst, Nutzerpreview,
Restart, Commit, Push, Subagent oder Registrierungsaufruf.

Bekannte Grenzen bleiben: gemeinsamer Hermes-Datenbestand, Filesystem-TOCTOU,
Hermes-Orphan-Reaper trotz False-Flag, flüchtige Secretkenntnis bis Poolende,
begrenztes Replay und keine sichere passive Skill-Expansion. Der nächste Gate-
Schritt gehört dem Parent: Registrierung plus echter eigener Runtime-Smoke.
