# Hermes V2: Inventar und Architekturentscheidung

Stand: 16.10.2026, Wrapt `f6a45419` / 2.8.0. Auftrag ist die angehängte
`WRAPT_HERMES_V2_IMPLEMENTATION_GOAL.md`. Diese Datei konsolidiert die
Recherche vor der ersten Produktänderung.

## Quellen und Geltungsbereich

- Wrapt-Bestand und Git-Historie: [Wrapt-Research](hermes-v2-wrapt-research.md).
- Installierter Hermes-Vertrag und aktueller Upstream: [Protokollmatrix](hermes-v2-protocol-research.md).
- T3 Code `cfafb4bb54d244e4612f5681aad3832ea64cb0fb`: [UX-/State-Research](hermes-v2-ux-research.md).
- Wrapt-Komponenten und Tokens: [GLM-Designinventar](hermes-v2-design-research.md), `index.css`, `visual-system.css`, bestehende Settings- und Route-Registry.
- Das unabhängige Codex-Inventarreview bildet das Implementierungsgate.

Hermes installiert: `07908be267f54f498230b3aae0f27c3f27d8c973`, Desktop-Vertrag 8.
Aktuelles Hermes-main führt bereits einen abweichenden Canonical-Vertrag ein.
Dieser Release implementiert ausdrücklich den nachgewiesenen installierten
Legacy-TUI-Gateway-Vertrag. Unbekannte Shapes werden sichtbar abgewiesen.
Hermes wird für dieses Feature weder aktualisiert noch neu gestartet.

## Produktentscheidungen

1. V1 bleibt erhalten. `HermesShell` entscheidet über die bestehende lokale
   App-Präferenz `hermesV2Enabled`, Standard false. V2 wird lazy geladen.
2. Bestehender Hermes-Einstieg zeigt bei aktivem Flag V2. Explizite klassische
   Verwaltungs-Deep-Links bleiben klassische UI. Eine sichtbare Aktion führt
   jederzeit zur klassischen Oberfläche, ohne Daten zu verändern.
3. Eigene Feature-Routen: `/wrapt/hermes-v2` und
   `/wrapt/hermes-v2/standalone`. Beide verwenden dieselbe Shell und denselben
   Controller; Standalone liegt außerhalb der großen Wrapt-Navigation.
4. Flag aus: keine V2-Transportinstanz, kein V2-WebSocket, kein V2-Polling.
   Auf einer direkten V2-URL erscheint nur der Aktivierungseinstieg.
5. Die UI verwendet Wrapt-Tokens. Keine `.hermes-shell`-Adminfarbwelt im V2-Chat.
6. Keine T3-Quellcodeübernahme. Die Verhaltensregeln werden neu implementiert.

Das Designinventar schlägt an einigen Stellen den älteren ACP-Transport vor.
Diese Empfehlung wird durch die verifizierte Gateway-Matrix ersetzt: V2 nutzt
`tui_gateway`, damit Clarify, Secrets und Subagents tatsächlich funktionieren.
Auch die Empfehlung, die eingefrorene Legacy-Routen-Datei zu erweitern, entfällt
zugunsten einer eigenen Feature-Registrierung. Aus der Entfernung der alten UI
lässt sich keine Aussage über damalige Fehlerfreiheit ableiten.

Wrapt liefert momentan dunkle Presets und frei konfigurierbare Farbrollen.
V2 muss auch mit hell konfigurierten Rollen lesbar bleiben; diese Konfiguration
wird isoliert geprüft. Ein paralleles V2-Farbsystem wird nicht eingeführt.

### Verbindlicher Phase-1-Routen- und Preference-Vertrag

Der BrowserRouter setzt `/wrapt` bereits als Basename. Registrierte Pfade sind
deshalb ausschließlich `/hermes-v2` und `/hermes-v2/standalone`.
Die Normalroute erhält `shell:"full-bleed"`, `persistent:true`, `topbar:true`
und `mobileNavigation:true`. Standalone erhält `shell:"standalone"`,
`persistent:false`, `topbar:false`, `mobileNavigation:false`.
Beide Routen haben `projectContext:false`, `breadcrumbs:false` und eigene
lazy Page-Exports; keine weitere Hauptnavigation wird registriert.

`?ui=classic` hat ausdrücklich Vorrang vor dem Flag. Ebenso behält jeder
bisherige `?path=...`-Verwaltungslink seine klassische Bedeutung. Der Classic-
Button verweist auf `/hermes-agent?ui=classic` und übernimmt vorhandene
Session-IDs sicher URL-kodiert. `?session=...` öffnet bei Flag aus dieselbe
klassische Session wie bisher, bei Flag an die V2-Session. Ein direkter V2-
Aufruf mit Flag aus mountet nur die Aktivierungskarte, keine Chat-Hooks.

Das bestehende `wrapt.app-preferences.v1` bleibt als Speicherschlüssel stabil.
Das enthaltene Zustand-Schema steigt von Version 1 auf 2. Eine explizite
Migration erhält `defaultPage`; `hermesV2Enabled` ist nur bei exakt `true`
aktiv, fehlende/ungültige Werte sind false. Ein Storage-Event wird ohne
erneutes Persistieren eingelesen, damit kein Echo zwischen Tabs entsteht.

## Datenhoheit und Persistenz

Hermes besitzt Sessionverlauf, gespeicherte IDs, Live-Sessions, Modellwahl,
Commands, Skills, Memory, Cron und offene Eingabeanfragen. Wrapt speichert
keinen eigenen Chatverlauf und keine Kopie der Hermes-State-Datenbank.

Wrapt besitzt ausschließlich Pin-Reihenfolge, Snooze, Settled, exakte Read-ACKs
und Darstellungspräferenzen. Organisationsmetadaten werden pro Workbench-Identität
und gespeicherter Hermes-Session-ID in einer eigenen Tabelle der bestehenden
Wrapt-SQLite-Datei gehalten. Dafür gibt es einen kleinen versionierten Vertrag.
Änderungen erhalten eine Revision; Undo darf eine zwischenzeitliche fremde
Änderung nicht überschreiben. Notifications und UI-Metadaten enthalten keine
Secret-Antworten oder vollständigen Chatverläufe.

Flag und Shelf-Collapse gehören zur vorhandenen browserlokalen UI-Persistenz.
Schema-Version erhöhen, alte Startseitenpräferenz migrieren, neue Felder strikt
validieren. Storage-Events/BroadcastChannel synchronisieren gleichzeitige Tabs.

## Transport

```
Browser / normale Shell / Standalone
  -> authentifizierter Wrapt-WebSocket /api/v1/hermes/v2/gateway
  -> Wrapt-Adapter pro Workbench-Identität
  -> vorhandenes Loopback-Dashboard /api/ws (Token nur serverseitig)
  -> bestehender Hermes Core und bestehendes HERMES_HOME
```

Kein zusätzlicher Serve-Prozess. Ein wiederverwendbarer Manager je Identität
vermeidet unnötige Verbindungen und hält laufende Arbeit bei UI-Navigation.
Jede Browser-Verbindung abonniert ihre Session; Navigieren schließt keinen
Hermes-Turn. Das Backend-Fanout unterstützt weitere Clients an derselben
Live-Session. Andere Prozess-Writer bleiben durch Hermes-Leases geschützt.

Der Adapter prüft Identität, Same-Origin und Payloadgröße. Keine frei wählbare
Upstream-URL, kein generisches privilegiertes JSON-RPC-Tunnel. Methoden und
Parameter werden explizit erlaubt, Antworten auf sichere Picker-/UI-Felder
projiziert. Freie `shell.exec`, `cli.exec`, beliebige `config.get/set`, Profilwahl
und Lease-Übernahmen werden nicht angeboten.

Contracts gehören featurelokal nach `packages/contracts/src/hermes-v2*.ts`.
Ein eigener Package-Subpath kann den eingefrorenen großen Barrel entlasten;
alternativ fachliche Extraktion, niemals Baseline-Erhöhung.

## Verifizierte API-Matrix

| Funktion | Hermes-Methode oder bestehende REST-Fläche | Adapterregel |
| --- | --- | --- |
| Handshake | `gateway.ready`, `client.capabilities` | `server_requests:true`, Epoch-/Contractprüfung |
| Liveness | `gateway.ping`, `ping` | begrenzte Timer, Cleanup |
| Liste | `session.list`, `session.active_list`, vorhandene Sessions-REST | stabile Summary-IDs; keine Running-Zeitheuristik |
| Neu | `session.create` | registriertes Projekt, CWD realpath innerhalb erlaubter Roots |
| Resume | `session.resume` / `session.activate` | gespeicherte und Live-ID getrennt |
| History | `session.history`, Resume-Snapshot | kein erfundener Cursor; UI begrenzt/ladet ältere Darstellung |
| Replay | `session.events.since` | Epoch + Live-ID + Sequenz, Snapshot bei Truncation |
| Chat | `prompt.submit` | keine automatische Wiederholung nach unbekanntem Ausgang |
| Stop | `session.interrupt` | nur verbundene Session |
| Steer/Background | `session.steer`, `prompt.background` | echte Hermes-Semantik |
| Approval/Clarify/Secret | JSON-RPC-Response auf offene `srq-*` | ID, Principal, Session, Choices/QIDs validieren |
| Modelle | `model.options`, enger `config.set` | Modellwahl ausdrücklich `--session`, kein globaler Defaultwechsel |
| Commands | `commands.catalog`, `complete.slash` | sichere Builtins als Domainaktionen, Skills als Agent-Prompt; kein freies `command.dispatch`/`slash.exec` |
| Anhänge | `image.attach_bytes`, `file.attach` | Größen-/MIME-/Namenslimits, keine freien Hostpfade |
| Subagents | `subagent.list`, strukturierte `subagent.*`-Events | nur reale Zustände, keine Logparser |
| Cron | bestehendes Dashboard `/api/cron/jobs` | nativer Adapter, gleiche Hermes-Cron-Engine |
| Skills | vorhandene Wrapt-Skillsseite und Hermes-Katalog | keine zweite Registry |
| Memory | Dashboard `/api/memory`, klassische Verwaltung | Providerstatus; kein erfundener Editor/Pending-Write-Katalog |
| Diagnose | bestehende Wrapt-Diagnose + Gatewaystatus | redigierte Felder, keine Token/Secret-Payloads |

## Reconnect und parallele Nutzung

- Monotone Event-Sequenzen gelten pro Live-Session und Prozessepoche.
- Deduplizierung per `(epoch, liveId, seq)`, niemals per Textvergleich.
- Nach Transportverlust keine Mutation blind wiederholen. Unklaren Sendestatus
  im Composer anzeigen und History laden, bevor ein Nutzer erneut sendet.
- Neue Epoche oder abgeschnittenes Replay: History, Inflight und offene Requests
  aus dem aktuellen Snapshot wiederherstellen. Bereits rekonstruierte Inflight-
  Tokens nicht erneut anwenden.
- Zwei Tabs erhalten denselben Verlauf. Antworten auf Requests werden nur einmal
  angenommen. Stale Karten resynchronisieren sich.
- Secrets bleiben ausschließlich im Eingabefeld bzw. flüchtigen Übertragungspfad,
  nach Submit leeren; keine Query-Persistenz, lokalen Logs oder Analytics.

## Verbindliche Sidebar-Zustandsmaschine

Die Reihenfolge der sichtbaren Gruppen ist Pinned, Needs input, Active,
Working, Snoozed, Settled. Zugehörigkeit und Status sind getrennt.

Auflösung pro Session:

1. Offener Request oder neuer entscheidungsbedürftiger Fehler: Needs input,
   auch wenn gepinnt, snoozed, settled oder parallel working.
2. Relevanter ungesehener Live-/Antwortbeleg: Needs input, ebenfalls vor allen
   Organisationszuständen. Read bestätigt ausschließlich exakte Quellen aus
   derselben tatsächlich dargestellten Row-/Eventprojektion. Opaque begrenzte
   Beleg-Handles binden Owner, Scope, Session und eingefrorene Source-ID-Menge.
   Kein Cursor-Maximum oder HTTP-Zeitpunkt bestätigt andere Antworten.
   Neue ungeklärte Abdeckung bleibt ehrlich als solche sichtbar; REST-Antworten
   ohne dauerhaften Turnbeleg werden nicht als Agentabschluss ausgegeben.
3. Effektive zukünftige Snooze-Zeit: Snoozed. Ein späterer relevanter Abschluss
   entwertet den alten Snooze dauerhaft, auch nach einer Lesebestätigung.
4. Effektiv Settled: Settled. Alte Abschlüsse vor `settledAt` holen nicht wieder hervor.
5. Pin-Modifikator: Pinned, mit sichtbarem echten Laufstatus.
6. Laufender Turn/strukturierte Background-Arbeit: Working; sonst Active.

Pins bleiben Metadaten, auch wenn ein offener Request die Zeile temporär nach
Needs input holt. Keine doppelten Zeilen. Working sortiert nach Start der Arbeit,
Token-/Tool-Events ändern die Reihenfolge nicht. Snooze ist mit offenem Request
nicht möglich. Abschluss nach dem Snooze-Zeitpunkt weckt die Session.
Manuelles Settlen löscht keinen Hermes-Request und beendet keine Arbeit.
`snoozedAt` und `settledAt` haben serverseitige Zeitbasis; Read ist eine monotone
Menge exakter Source-ACKs, auch vor spätem Fact-Ingest. Change-/Org-Cursor bleiben
für Invalidierung und dauerhaften Wake erhalten. Gemeinsame Belege bleiben von
privater Organisation getrennt; unbekannte Ursprungszeiten werden nicht erfunden.
Der begrenzte externe Abgleich prüft höchstens 64+64 Rows auf einen logischen Anchor,
sonst meldet er eine Lücke. Details stehen im `hermes-v2-organisation-handoff.md`;
der konsolidierte Belegentwurf wird vor Phase 4 erneut unabhängig geprüft.
UI-Uhrdrift entscheidet nie über Aufmerksamkeit.
Pflichttests: pinned+unseen, settled+neuer/alter Abschluss,
snoozed+neuer Abschluss, working+offener Request.

### Verbindliche Auflagen für Phase 2

- Request-Claims binden Principal, Live-ID, Epoche und Request-ID. Nur eine
  berechtigt abonnierte Browser-Verbindung darf einen Claim atomar übernehmen.
  Choice-/QID-/Response-Schemas prüfen; Classic kann zuvor gewinnen, deshalb
  nach Antwort den offenen Requestbestand resynchronisieren. Keine behauptete
  Hermes-Mandantentrennung: der bestehende Hermes-Datenbestand ist gemeinsam.
- CWD vor Create und jedem schreibenden Attach/Resume/Submit gegen reale
  Rootpfade prüfen. Gespeicherte CWD vor Resume lesen, resultierende Live-ID
  und CWD danach erneut prüfen. Unbekannte oder unerlaubte CWD sperrt Schreiben.
  Symlink-TOCTOU als Dateisystemgrenze dokumentieren, keine Leases übernehmen.
- `close_on_disconnect:false` immer explizit. Browser-Abos können enden, ohne
  den Turn zu schließen. Manager mit laufender Arbeit bleiben bis zum Abschluss
  aktiv; idle Manager begrenzt halten und nach Inaktivität entsorgen. Pending-
  RPCs, Backoff, Sendqueues und Fastify-Shutdown erhalten begrenztes Cleanup.
- Ready prüft Replay-Epoche/Fähigkeiten; `desktop_contract` wird erst an
  Session-Info geprüft. Keine erfundene Versionsangabe im Ready verlangen.
- Neue Draft-Session wird von Hermes erst beim ersten Prompt dauerhaft
  geschrieben. Eine zurückgegebene Stored-ID allein beweist keine Persistenz.
- Interne Events wie `run.completed` sind normalisierte Wrapt-Ereignisse,
  keine behaupteten Upstream-Namen. `message.complete` bildet den Abschluss,
  `session.info` den echten Laufzustand und `srq-*`/`request.cancel` die Requests ab.
- Organisations-REST schreibt revisionsgebunden, der Manager sendet anschließend
  eine Metadaten-Invalidierung an alle Clients desselben Principals.

Drop-Ziele sind ausschließlich Pinned, Active und Settled. Snoozed kann als
Quelle dienen (Wake), benötigt als Ziel aber einen expliziten Termin. Working
und Needs input sind keine manuellen Ziele. Jede Drag-Aktion hat Menü-/Tastatur-
Alternativen. Undo arbeitet revisionsgebunden und zeitlich begrenzt.

## Dateimap und Phasen

Phase 1:

- Bestehend: `stores/appPreferences.ts`, `views/settings/SettingsEasterEggs.tsx`,
  `lib/settingsSearch.ts`, `components/hermes/HermesShell.tsx`,
  `extensions/builtinContributions.ts`.
- `App.tsx` bindet den Storage-Abgleich mit React-Effect und Cleanup ein;
  dadurch entstehen keine globalen Listener beim bloßen Import des Stores.
- Neu: `views/settings/HermesV2Settings.tsx`, `extensions/hermesV2Builtins.ts`,
  `views/HermesV2Route.tsx`, `components/hermes/v2/HermesV2Shell.tsx` und CSS.
- Tests: Default-off, Migration/Persistenz, Navigation/Standalone, V1 unverändert,
  kein V2-Traffic bei off und Unmount-Cleanup.

Phase 2:

- Neue Contracts und `apps/server/src/hermes/v2/` mit Gateway-Manager,
  Protokollvalidierung, Session-Zuordnung, Request-Registry, Redaction und Routen.
- Kleine Einbindung in `app/routes.ts`; Manager-Shutdown über Fastify-Hook.
- Fake-Gateway-Integration, malformed/oversize/auth/origin/path/replay Tests.
- Separates Codex-Sicherheitsreview vor dem Chat-Gate.

Phase 3–7:

- Featurelokaler Client, Normalizer, Reducer, Hook; UI-Komponenten getrennt von
  Transport, Organisation getrennt vom Sessionzustand.
- MessageList, ToolCard, Reasoning, Composer, SlashPalette, ModelPicker,
  RequestCards, Sidebar/Row/Shelf, Snooze und Organisationsaktionen.
- Bestehende `marked`, `dompurify`, `highlight.js` nutzen, keine neue Paketwelt.

Phase 8–11:

- Native Cron-/Diagnoseflächen, bestehende Skills verlinken, Memory-Fähigkeiten
  korrekt begrenzen; responsive/Standalone-Polish.
- Tests für viele Sessions, 20+ Working-Sessions, lange History, Reconnect,
  zwei Tabs, Tastatur, Reduced Motion sowie alle vier Abnahmebreiten.
- Codex Backend/Security, GLM Visual und DeepSeek UX unabhängig prüfen lassen,
  Findings beheben, vierter Codex-Lauf verifiziert alle Findings.

## Nachgewiesene Basis und Grenzen

- `pnpm typecheck` und `pnpm architecture:file-lines` vor Änderungen erfolgreich.
- Tatsächlicher authentifizierter Read-only-WS-Smoke: Ready und Sessionliste
  am bestehenden Dashboard erfolgreich, keine Session verändert.
- TUI-History ist unpaginiert; die verifizierte Dashboard-REST-History bietet
  echte `offset/limit/order`-Pagination. Der Adapter verwendet diese lesende API.
- Kein vollständiger Queue-Listenvertrag: nur tatsächlich vorhandenen queued
  Usertext anzeigen. Memory-Pending-Writes fehlen als strukturierte API.
- Admin-/Expertenfunktionen bleiben über die klassische UI erreichbar.
- Laufende Nutzerprozesse, Slots, tmux und Ports sind kein Testmaterial.
