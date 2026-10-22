# Phase 6: nonvisueller Composer-Client

Stand: 16.10.2026. Implementierung abgeschlossen, eigener Scope eingefroren.
Dies ist der Autorenbericht, kein unabhängiges Gate. Phase 7 bleibt unberührt.

## Feste API

Die früh veröffentlichte `hermes-v2-phase6-client-interface.md` gilt unverändert.
`HermesV2Chat.composer` liefert getrennte Modell-, Titel-, Reasoning- und
Attachmentzustände. Neue Actions: `setTitle`, `selectReasoning`,
`uploadAttachment`, `removeAttachment`, `checkUpload`, `cancelModelSelection`.
Alle asynchronen UI-Actions bilden Fehler im Viewmodel ab und resolven;
ein aufgelöstes Promise beweist weiterhin keine erfolgreiche Corewirkung.

`selectModel(selection, confirmed?)`, bestehende Text-/Queue-Submit-API und
Phase-5-Request-API bleiben erhalten. `submit` ergänzt ausschließlich die beim
Klick erfassten eigenen ready-IDs. Leerer Text benötigt einen solchen Anhang.
`resolveChatCommand` liefert native Intents, erkennbare Skillanweisungen oder
unsupported. Kein Dispatch-/Shell-/Slash-RPC; Queue/Steer-Intents bleiben gesperrt.

## Umsetzung

- Neue Module: `chat-composer-types/state/guards.ts`, `chat-composer.ts`,
  `chat-attachment-client.ts`, `chat-attachments.ts`, `chat-commands.ts`.
- Additiv angepasst: `chat-types/actions/owners/runtime/state/events/messages.ts`,
  `chat-policy.ts`, `gateway-client.ts`, `useHermesV2Chat.ts` und Testfixtures.
- Composeroptin kombiniert sich mit `readEvidence=1` auf demselben Socket.
  Die Connection-ID kommt ausschließlich aus dem tatsächlichen Serverframe;
  Close, Socketwechsel und geänderter Connectionkontext entwerten sie sofort.
- Modellwahl prüft Owner, Snapshot-/Auswahlrevision und Socket vor/nach Await.
  Kostenbestätigung gilt nur für exakt dieselbe angefragte Auswahl und denselben
  beobachteten Kontext. Deferred überschreibt keine laufende Ist-Auswahl.
- Titel nutzt echte native Receipts. `pending` bedeutet unbestätigt; neuere
  Snapshot-/Titelbeobachtungen gewinnen gegen verspätete Antworten. Bestätigte
  Titel aktualisieren den bestehenden nativen Summarypfad, keine eigene Titelquelle.
- Reasoning benötigt bereits initial bestätigtes Idle/Writable/Online und prüft
  dies unmittelbar vor Send erneut. Requested, beobachtete Stufe und Wirestufe
  bleiben getrennt. `none` benötigt ausdrückliche Modellfähigkeit. Approvals sind
  ausschließlich global readonly; fehlende optionale Daten bleiben unbekannt.
- Alle vier Schreibpfade prüfen Bereitschaft vor Status-/Fehleränderung und
  erstem Await. Ein später bereit gewordener Zustand sendet keinen alten Klick.
- Anhänge gehören zum tatsächlichen Owner-/Sessiondraft. Bindung umfasst
  Ownergeneration, Stored-ID, Session-/Connectionepoche, CWD, Socket und Abo.
  Metadaten enthalten keine Files/Bytes zum Wiederholen. Inputfiles werden direkt
  mit genau einem `file`-Multipartteil und tatsächlicher Connection-/Upload-ID gesendet.
- Clientgrenzen: 4 MiB pro Datei, zehn Anhänge, ein laufender Uploadversuch,
  60 Sekunden Deadline und tatsächlich auf 64 KiB begrenzter Response-Stream.
  Antworten werden mit öffentlichen strikten Zod-Schemas plus Uploadkorrelation
  geprüft; fremde IDs, Pfade und unvereinbare Status-/Attachmentkombinationen verworfen.
- Verlorene POSTantworten bleiben unknown. Nur bewusster GET derselben Upload-ID
  klärt den Status; kein automatischer Wiederupload. Statusfehler, auch 404, beweisen
  keinen ungesendeten ursprünglichen POST. Neue Verbindung ist bewusst prüfbar,
  geänderte Core-/Sessionepoche oder CWD dürfen nicht still neu gebunden werden.
- Ownerwechsel, Unmount, Flag-off und Unsichtbarkeit aborten Fetches, löschen
  eigene Metadaten/Timer und entwerten späte Ergebnisse. Remove ist rein lokal.
  Ein alter ignorierter Abort kann eine neuere Statusklärung nicht überschreiben.
- Submit hält eine Kopie der ursprünglichen Dateimenge. Ein positiver Receipt
  entfernt nur diese konkreten Einträge, niemals neue Dateien oder fremde Drafts.
  Unknown benötigt Abgleich, erneute Bindungsprüfung und bewusste Risikobestätigung.
  Resend eines alten Texts übernimmt keine inzwischen neu hinzugefügte Datei.
- Historyanhänge entstehen nur aus öffentlichen Metadaten bzw. positivem
  Userrow-Receipt. Row-Identität bleibt maßgeblich; keine Text-/Pfadheuristik.
  Ein Receipt kann exakt seine schon geladene Userrow anreichern, ohne Dublette.
- Tokenereignisse veröffentlichen weiterhin weder Owner-/Composerzustände noch
  Sessionkatalog/Sidebar neu. Phase-4-Organisationsdateien blieben unangetastet.

## Prüfungen

- Featurelauf: **408/408**, 33 Dateien. Vorheriger Bestand plus 92 neue Fälle.
  Darunter Initial-/letzte Guards, Readonly/Loading/Offline/Hidden/Flag-off,
  zwei Owner, A→B→A, Kostenbestätigung, deferred, neue Epoche/Connection,
  TTL/Dateigrenzen, Lost POST/GET, Abort/Timeout/Späterfolg, bewusster Status,
  leere Nachricht mit Datei, Queueannahme, exakte Userrow und neue Drafts.
- Unveränderte externe Phase-4-Suite: **172/172**, 16 Dateien.
- Unveränderte externe Phase-5-R1-Suite: **30/30**, zwei Dateien.
- Unveränderte externe Phase-5-R2-Suite: **38/38**, zwei Dateien.
- Scoped ESLint für alle `chat-*`, `gateway-*`, Hook und Hooktests: grün.
- Separates `pnpm typecheck:e2e`: grün.
- `pnpm architecture:file-lines`: grün; größte bearbeitete Produktdatei
  `chat-runtime.ts` mit 338 Zeilen, alle eigenen Dateien unter 400.
- Vollständiges `pnpm typecheck`: Extensioncontracts, Contracts und Server grün.
  Web stoppt ausschließlich an gleichzeitig bearbeiteten fremden UI-Stellen:
  ChatSurface-Teststub ohne composer, optionales onOpenSessions in ComposerArea,
  unbenutzte Composer-/Toolbarvariablen und fehlendes slashDescription-Export.
  Keine gemeldeten nonvisuellen Typfehler. Root übernimmt den finalen Gesamtlauf
  nach UI-Freeze; diese fremden Dateien wurden nicht angepasst.

Reproduzierbarer Featurelauf aus `apps/web`:
`pnpm exec vitest run src/components/hermes/v2/chat-*.test.ts src/components/hermes/v2/gateway-client.test.ts src/components/hermes/v2/organization-*.test.ts src/components/hermes/v2/sidebar-domain.test.ts src/components/hermes/v2/useHermesV2Chat.test.tsx src/components/hermes/v2/useHermesV2Sidebar.test.tsx --reporter=dot`

Externe Läufe jeweils mit dem unveränderten `vitest.config.mjs` unter
`temp/hermes-v2/phase4-client-review/`, `phase5-client-review/` und
`phase5-client-review-r2/`.

## Unterstützte Grenze / Übergabe

Dateien sind native File-Referenzen, keine Vision-/PDF-Turngarantie. Historischer
Text kann absolute native @file-Pfade enthalten. Download-UI verwendet ausschließlich
schema-validierte opaque IDs; der Client erzeugt keine freien Download-URLs.
Kein Browser, Dienst, echter HTTP-/Coreaufruf, Vertrags-/Server-/UI-Coedit oder Git.
Root besitzt Browserintegration, unabhängigen Review und abschließende
Versions-/Changelogpflege; Phase 7 wird hier nicht begonnen.
