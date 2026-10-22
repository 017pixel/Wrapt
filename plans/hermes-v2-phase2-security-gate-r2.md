# Hermes V2 Phase 2: unabhängiges Security-Gate R2

**Entscheidung: needs fixes. Ein High- und ein Medium-Befund offen.**
Keine Freigabe zur Parent-Registrierung oder produktiven Integration.
H2, M1 und M2 sind geschlossen; H1 benötigt eine weitere Redaction-Korrektur.
Der Parent-Befund zu kurzen Secrets ist hinsichtlich Stream-Feldlängen offen.

Stand: 16.10.2026, geteilter Checkout. Gelesen: Originalauftrag aus dem
Attachment, Inventory, Protokoll-Recherche, Backend-Handoff, erster Gatebericht,
Implementierungsbericht und `hermes-v2-phase2-security-fixes.md`.
Produktprüfung ausschließlich `apps/server/src/hermes/v2/*`,
`packages/contracts/src/hermes-v2*.ts` und Contracts-Subpath; vorhandene
Auth-/Redaction-Helfer und installierte Hermes-Quelle ergänzend gelesen.
Einzige neue Projektdatei dieses Reviews ist dieser Bericht. Keine Produktänderung,
App-Registrierung, Browserprüfung, echte Hermes-Anfrage, Session oder Mutation.
Keine Dienste, Nutzerpreviews, Neustarts, Commits, Pushes oder eigenen Subagenten.

## H1 weiterführen, High: JSON-Escaping umgeht die bekannte Secretmaskierung

Die ursprüngliche Principal-Lücke ist korrigiert: `pool.ts:18` und `pool.ts:32`
teilen die flüchtige Wertekenntnis. Normale Tool-/Stream-/History-Echos werden
für beide Principals maskiert, auch nach Managerentsorgung. Streamkanäle sind
getrennt; ausgeschöpfte Secretkapazität lehnt vor Claim/Send ab.

Verbleibende Stellen: `normalize-values.ts:24`, insbesondere `:26`,
`secret-redactor.ts:39` und `:46`, `redact-browser.ts:12`, `:41` und `:42`.
Toolpfade: `normalize-events.ts:48` und `:50`, `normalize-history.ts:19` und `:31`.
Alle Dateiangaben dieses Abschnitts relativ zu `apps/server/src/hermes/v2/`.

`jsonText` serialisiert strukturierte Toolwerte, bevor der bekannte Secretwert
angewendet wird. Anführungszeichen, Backslash und Zeilenumbruch werden dabei
escaped. `text/stream` suchen nur die ursprüngliche Zeichenfolge. Die Browser-
Projektion erkennt die serialisierte Variante ebenfalls nicht. Der gemeinsame
Redactor kennt das Secret weiterhin, gibt aber dessen vollständig umkehrbare
JSON-Darstellung an alle abonnierenden Principals aus.

Unabhängiger Repro: `/tmp/hermes-v2-security-r2.A5PgJn/escaped.ts`.
Zwei echte Manager am selben isolierten Fake-Core, Secretantwort über A:

```ts
const value = 'R2"QUOTED\\VALUE\n81';
// Fake tool.start: args = {echo: value}
// Fake tool.complete: result = {echo: value}
assert.equal(JSON.parse(browserToolInput).echo, value);
assert.equal(JSON.parse(browserToolOutput).echo, value);
```

Beide Assertions treffen bei A und B zu. Zusätzlich bestätigt: derselbe Wert
aus `history.read`-Toolinput, aus fragmentierten JSON-Echos in Text und Reasoning
sowie aus einem frischen Snapshot nach Entsorgung beider ursprünglicher Manager.
Die Browserframes sind gültig; ein anschließendes `JSON.parse` rekonstruiert
das komplette Dummy-Secret. Es handelt sich nicht um erhaltene Routing-IDs.

Auswirkung: normale strukturierte Toolargumente/-ergebnisse können eingegebene
Passwörter erneut an Browser verteilen. Fremde Principals brauchen nur das
bereits erlaubte Session-Abo. Weder rohe RPCs noch eine weitere Secretantwort
sind zum Lesen erforderlich. Auch Vault-Passwörter können solche Zeichen enthalten.

Korrektur: bekannte Werte in fachlichen Inhaltsobjekten vor der Serialisierung
maskieren und bereits serialisierte Inhalte/Streams einschließlich ihrer
kanonischen JSON-Escapes abdecken. Beispiel für strukturierte Inhalte:
`input = jsonText(scrubContent(raw.args, secrets))`.
Für bereits serialisierte Strings/Chunks auch die escaped Darstellung
`JSON.stringify(value).slice(1, -1)` berücksichtigen oder gleichwertig sicher
projizieren. Varianten atomar in die Kapazitätsprüfung einbeziehen, vor Claim/Send
ablehnen und keine bekannten Werte vergessen. Keine rekursive Envelope-Maskierung.
Pflichttests: obige Zeichen, zwei Principals, geteilte Chunks, Toolstart/-abschluss,
History und Snapshot nach Eviction; Rohwert und decodierbare Variante abweisen.

## M3 neu, Medium: maskierte Streamchunks überschreiten den Browservertrag

Stellen: `secret-redactor.ts:48`, `:50` und `:62`, `manager.ts:345` und `:350`;
`redact-browser.ts:9` und `:37`; Grenze in
`packages/contracts/src/hermes-v2-sessions.ts:4`.

Die neue Längenbegrenzung in `SecretRedactor.text` bezieht sich beim zweiten
Maskierungsschritt bereits auf den vergrößerten Streamtext. Sie begrenzt damit
nicht mehr auf die ursprüngliche Feldgrenze. Auch ein zurückgehaltener Prefix
kann den nächsten gültigen Chunk über diese Grenze schieben.

Zwei unabhängige Gegenbeispiele in
`/tmp/hermes-v2-security-r2.A5PgJn/recheck.ts`:

1. Secret `a`, anschließend ein gültiger `message.delta` mit 200.000 `a`.
   `stream` erzeugt 600.000 Maskierungszeichen. Der Browser erhält ausschließlich
   `PROTOCOL_MISMATCH`, den Delta-Event erhält er nicht.
2. Secret `R2_LONG_SECRET_887`, erster Chunk `R2_LONG_`, danach 200.000 `Z`.
   Der gepufferte Prefix ergibt 200.008 Zeichen und denselben Protokollfehler.

Beide Eingangsframes sind innerhalb der Protokoll-/Payloadgrenzen. Der Fehler
entsteht erst im Sicherheitsfilter. Der Sequenzcursor ist zuvor bereits erhöht;
die laufende Ausgabe verliert diesen Event bis zur Wiederherstellung per Snapshot.
Der poolweite Secretwert kann damit auch die Auslieferung an andere Principals
beeinträchtigen. Ein Secret-Leak wurde in diesen beiden Längenfällen nicht gefunden.

Korrektur: maskierte Ausgabe nach Prefix-Verarbeitung auf die konkrete
Inhaltsgrenze begrenzen oder vertragskonform mit definierter Cursorsemantik
ausliefern; z. B. `boundedText(maskedStream, 200_000)` vor der Eventvalidierung.
Routing und Sequenz unverändert halten, Secret-Prefixschutz nicht abschneiden.
Pflichttests für Text und Reasoning an der Obergrenze, kurze Secrets,
zurückgehaltene Prefixe und zwei Principals. Tool-/History-/Titelgrenzen sind in
den eigenen Grenztests bereits korrekt; die Lücke betrifft den Streampfad.

## Geschlossene Altbefunde

H2 geschlossen: `manager.ts:65`, `:294` und `session-service.ts:83` binden den
Eigentumsnachweis an Epoch/Live-ID und verwerfen ihn beim neuen Attach.
Eigener Repro: Create/Submit, neuer Epoch, wiederverwendete True-Flag-Runtime,
V2 aus. Socket und laufender Turn bleiben erhalten. Eine noch laufende Subagent-
Arbeit hält den Socket auch nach Hauptturnabschluss; erst bestätigter Abschluss
beider Ebenen entsorgt ihn. Kein Stop/Close und keine Änderung des fremden Flags.
Der vorhandene Test mit zusätzlichem Classic-Socket besteht ebenfalls.
Die gelesene installierte Quelle bestätigt die zugrunde gelegte Semantik:
`tui_gateway/methods_session.py:885`, `session_lifecycle.py:1032`.

M1 geschlossen: `request-registry.ts:80`, `:90`, `:117`,
`manager.ts:164` und `upstream.ts:238` erfassen Claimtoken/Transportende und
verlangen einen aktuellen Open-Requests-Abgleich. Eigene Repros bestätigen
verlorene Antwort, gleichen Epoch, keine automatische Wiederholung und einen
erfolgreichen bewussten Neuversuch. Ein aktiver fremder Send bleibt gesperrt;
nach seinem Transportende funktioniert explizite Recovery. Gleichzeitige Principals
senden genau einmal; Classic-Settlement bleibt stale. Der vorhandene Test gegen
verspätetes Unlock eines alten Tokens besteht.

M2 geschlossen: `manager.ts:122`, `operations.ts:58`, `:69`, `:100`, `:108`,
`:116`, `session-service.ts:40` und `:76` schützen die letzte Sendgrenze.
Eigene Matrix: alle sechs Sessionmutationen, je Release/Navigation/Flag-off
während REST-Detail- und letztem RPC-Preflight, insgesamt 36 Kontrollen.
Zusätzlich Flag-off bei Create-CWD, Create-Katalog und Resume-Lineage geprüft.
Kein neuer Mutationssend/Claim und kein Stop bereits laufender Arbeit.
Vorhandene Abo-/Live-ID-/Epoch-Wechseltests bestehen ebenfalls.

Parent-Kurzsecret-Befund teilweise geschlossen: UUID-Korrelation, Envelope,
Discriminators, Session-/Tool-IDs, Approval-Choices sowie Modell-/Provider-IDs
bleiben bei `a` und `once` exakt. Tool-, History- und Titelmaskierung besteht
auch an den Feldgrenzen. Verbleibender Streampfad siehe M3.

## Prüfungen und erhaltene Grenzen

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 17 Dateien,
  147 Tests erfolgreich, einschließlich 97 V2-Tests und bestehendem Hermes-Code.
- Eigener Recheck: 52 Kontrollen, 50 erfolgreich, zwei bestätigte M3-Fehlschläge.
  Der separate `escaped.ts` bestätigt H1 mit Assertions auf rekonstruierbare Werte.
  Beide ausführbar mit `pnpm --filter @wrapt/server exec tsx <absoluter Pfad>`.
  Der alte Reproducer wurde inhaltlich angepasst, seine alten Bug-Erwartungen
  wurden nicht als neue Findings übernommen. Alle Fake-Sockets/Temp-CWDs entsorgt.
- `pnpm typecheck`, gezielter ESLint mit `--max-warnings=0`,
  `pnpm architecture:file-lines` und Scope-`git diff --check` erfolgreich.
  Neue Backendmodule maximal 362 Zeilen, keine historische Baseline erhöht.
- Origin und Identity vor Upgrade, strikte Domainframes, exakte Stored-/Live-IDs,
  realpath-CWD vorher/nachher/vor Mutation und Request-Choice/QID/Lock-Prüfung
  bleiben vorhanden. Keine freie RPC-/Shell-/Config-/Skill-Expansion gefunden.
- Snapshot-/Replay-Klammer, Sequenz-Dedupe, fehlende Mutationretries sowie
  Ressourcenlimits/Cleanup bleiben erhalten. Packageänderung nur zusätzlicher
  Feature-Subpath; keine neue App-Registrierung oder zweite Hermes-Runtime.

## Übergabe an den Parent

Zuerst H1 und M3 korrigieren und unabhängig erneut prüfen. Bis zum PASS bleiben
Registrierung und Integration gesperrt. Ein späteres PASS erlaubt ausschließlich
die Parent-Registrierung und die anschließenden eigenen echten Runtime-Smokes.
Dieses Gate bestätigt weder reale Hermes-Kompatibilität noch das Gesamtprodukt.
Bestehende Grenzen bleiben: gemeinsamer Hermes-Datenbestand, Filesystem-TOCTOU,
Orphan-Reaper, begrenztes Replay und flüchtige Secretkenntnis bis Pool-Cleanup.
