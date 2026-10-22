# Hermes V2: unabhängiges Phase-0-Review

Stand: 16.10.2026, Wrapt `f6a45419`, installierter Hermes-Checkout
`07908be267f54f498230b3aae0f27c3f27d8c973`.
Scope: Auftragsprüfung und technische Bestandsaufnahme, ausschließlich dieser Bericht.
Keine Produktänderungen, Dienste, Previews, Neustarts, Commits oder Claude-CLI.
Keine generischen Audit-Skills verwendet.

## Urteil: needs fixes

Die Architektur ist für Phase 1 geeignet. Das formale Phase-0-Gate ist noch
nicht bestanden: Designresearch und Inventar widersprechen sich bei Transport,
Persistenz und Dateimap; die konsolidierte Zustandspriorität ist nicht eindeutig.
Vor dem Implementierungsstart H1/H2/H5 im verbindlichen Inventar auflösen.
Die späteren Transportauflagen H3/H4 sind Gates vor Phase 2, keine Forderung,
den Gateway bereits in Phase 1 zu implementieren.

Geprüft: `hermes-v2-wrapt-research.md`, `hermes-v2-protocol-research.md`,
`hermes-v2-ux-research.md` und das während dieses Reviews hinzugekommene
`hermes-v2-inventory.md`. Das GLM-`hermes-v2-design-research.md` traf während
des Reviews ein und wurde ebenfalls geprüft. Der vollständige Implementierungsauftrag
wurde gelesen. Ergebnisse der Research-Agenten wurden gegen lokale Quellen
geprüft; deren entfernte Upstream-Checkout-Stände sind keine eigene Verifikation.

## Blocker

Keine nachgewiesene grundsätzliche technische Blockade. Alle vier Research-
Dateien liegen inzwischen vor. Das Inventar muss seinen inzwischen veralteten
Hinweis auf das fehlende GLM-Ergebnis aktualisieren und dessen Abweichungen
ausdrücklich verwerfen oder auflösen. High-Findings verhindern die Gate-Freigabe.

## High

### H1: Aufmerksamkeit kann in Pinned oder Settled verborgen bleiben

Inventar, Abschnitt „Verbindliche Sidebar-Zustandsmaschine“: Regel 1 behandelt
offene Requests/Entscheidungsfehler, Regel 3 Settled und Regel 4 Pinned, erst
Regel 6 ungesehene Abschlüsse. Damit gewinnt Pinned gegen einen ungesehenen
Abschluss, obwohl dieser laut derselben Regel zu Needs input gehört.
„Settled ohne neue Aufmerksamkeit“ lässt die erforderliche Definition offen.
Das UX-Paper ordnet ungesehene Abschlüsse zusätzlich Active statt Needs input zu.
Der Auftrag §5.2 fordert ungesehene Antworten in Needs input.

Korrektur: eine gemeinsame reine Resolver-Spezifikation, zuerst offene Requests,
entscheidungsbedürftige Fehler und relevante ungesehene Abschlüsse prüfen.
Festlegen, welche Abschlüsse nach Snooze/Settle neue Aufmerksamkeit auslösen,
inklusive Zeit-/Wasserzeichenvergleich. Pins bleiben erhalten, erzeugen aber
keine zweite Zeile. Tests: pinned+unseen, settled+neuer Abschluss,
settled+alter Abschluss, snoozed+Abschluss, working+offener Request.

### H2: Route-/Preference-Vertrag für Phase 1 muss konkret sein

Inventar nennt öffentliche URLs mit `/wrapt`, aber keine registrierten Pfade,
Flags der Route-Contribution oder eindeutige Classic-Ausnahme.
`App.tsx` setzt `BASE_URL` bereits als Router-basename;
`extensions/routeHost.tsx` nimmt nur `shell: "standalone"` aus der AppShell heraus.
Eine Registrierung mit `/wrapt/hermes-v2` würde den Basispfad verdoppeln.
Ein Classic-Link zurück auf dieselbe Flag-auswertende Shell könnte V2 erneut öffnen.

Verbindlich festlegen: Registry-Pfade `/hermes-v2` und
`/hermes-v2/standalone`, letzterer `shell: "standalone"`, nicht persistent,
ohne Topbar/mobile Navigation. Normalroute nutzt die Wrapt-Shell.
Explizite `?ui=classic`-Auswahl hat Vorrang vor dem Flag.
Bestehende `?path=...`-Verwaltungslinks behalten ihre Classic-Semantik,
`?session=...` bleibt bei Flag aus exakt wie heute.
Direkte V2-Routen bei Flag aus mounten nur den Aktivierungseinstieg.

`appPreferences.ts` persistiert bisher ausschließlich `defaultPage`, Version 1,
mit eigener Merge-Funktion. Bei Versionsanhebung ist eine explizite Migration
erforderlich, damit Zustand alte Startseiten nicht verwirft. Merge allein
ersetzt diese Migration nicht. Das Flag strikt als Boolean lesen, fehlende oder
ungültige Werte ergeben false. Cross-Tab-Sync darf keine Schreibschleife erzeugen.

### H3: pro Principal ein Manager ersetzt keine Session-Autorisierung

Das Inventar sieht die richtigen Prüfungen vor, aber der genaue Claim-/Reply-
Vertrag muss vor Phase 2 explizit werden. Hermes `server_requests.py:265`
nimmt die erste Antwort auf eine globale offene ID an und validiert weder
Wrapt-Principal noch vollständige methodenspezifische Antwortformen.
`session.resume` kann dieselbe bereits live geladene Session wiederverwenden.
Mehrere Principal-Manager allein isolieren diesen gemeinsamen Hermes-Core nicht.

Request-Registry mindestens an Principal, Live-ID, Epoche und Request-ID binden;
Antwort nur von berechtigt abonnierten Verbindungen annehmen. IDs nie blind
vom Browser an Upstream durchreichen. Choices, QIDs, Methode und Ablaufzustand
validieren; parallele Antworten atomar lokal beanspruchen und anschließend
Upstream-Settlement resynchronisieren. Classic-Client kann außerhalb dieser
Registry gewinnen. Secret-Antworten nicht an andere Tabs zurücksenden.
Keine private Hermes-Mandantentrennung versprechen: Wrapt dokumentiert in
`security/workbench-identity.ts` ausdrücklich gemeinsame globale Daten.

### H4: Wiederaufnahme darf keine ungeprüfte CWD aus Hermes aktivieren

Die bestehende Route prüft CWD nur lexikalisch mit `resolve` und Root-Präfix;
das ist keine symlinksichere Vorlage. Projektauflösung in `app/routes.ts`
prüft Verfügbarkeit, aber ebenfalls keinen realpath.
Create-Parameterprüfung allein reicht für V2 nicht: Resume übernimmt den
Hermes-eigenen gespeicherten Pfad; eine Session kann außerhalb erlaubter Roots
entstanden sein. Live-CWD kann später ebenfalls wechseln.

Vor schreibendem Attach/Resume/Submit CWD und erlaubte Roots serverseitig
kanonisieren, fehlende/unerlaubte Pfade geschlossen ablehnen. Für externe
Sessions mit unbekannter CWD nur lesende Darstellung oder eindeutige Sperre
vorsehen. Browser darf weder freien Pfad noch Profil, Sessiontitel als
Resume-Alias oder Lease-Übernahme wählen. Auf tatsächlich aufgelöste IDs prüfen.
TOCTOU-Grenze des Dateisystems dokumentieren; reine Stringprüfung genügt nicht.

### H5: Designresearch darf kein zweiter Implementierungsvertrag werden

Designreport §§3/5/6/7 schlägt den alten ACP-`session.attach`-/`model.set`-
Transport, clientlokale Pin/Snooze/Settled-Daten und ein separates `v2Enabled`
im neuen Persist-Store vor. Außerdem sollen `legacyPageRoutes.ts` und der
1841-Zeilen-Contracts-Barrel wachsen. Diese Vorschläge widersprechen dem
konsolidierten Inventar und den Dateigrenzen. Änderungen nur an `HermesRoute`
erreichen zudem Panel/Orbit nicht. Maßgeblich bleibt der Dispatcher an
`HermesShell`, vorhandene appPreferences und der neue Gateway-Adapter.

§1 behauptet, die dunkle Basis bleibe immer erhalten. `themeRuntime.ts:5-48`
überschreibt jedoch Hintergrund, Text und Ink-Tokens aus `AppearanceTheme`.
Der Auftrag fordert Light/Dark ausdrücklich. V2 muss semantische Tokens nutzen
und beide Kontrastlagen testen; Dark-only darf nicht still als Reduktion gelten.
Standalone muss Responsive-/Viewport-Hooks selbst bereitstellen, soweit sie
sonst nur AppShell setzt, inklusive Touch-Zielen und Keyboard-Inset.

Alten Hook nicht als geprüfte Dedupe-/Reconnect-Basis deklarieren. Die Aussage,
die SPA-Umstellung habe keine technischen Defekte als Ursache gehabt, ist aus
dem Commit nicht belegbar. Belegt ist lediglich die sichtbare Produktentscheidung.
`tool.update`, `allow_once` und `task.cancel` sind alte Wrapt-ACP-Begriffe;
für neue UI nur nach expliziter fachlicher Normalisierung verwenden.

## Medium

### M1: Wrapt-Research enthält veraltete Dateipfade

`extensions/legacyBuiltins.ts` existiert nicht. Tatsächlicher Bootstrap:
`apps/web/src/extensions/builtinContributions.ts`.
Loader liegen in `apps/web/src/lib/routeModules.ts`, nicht `extensions/`.
Das konsolidierte Inventar korrigiert den Bootstrap bereits.
Für Phase 1 die folgende Dateimap verwenden.

### M2: `session.create` ist nicht sofort dauerhaft gelistet

Die Protokollmatrix bezeichnet das Ergebnis als neue dauerhafte Session.
Installierter Vertrag `tui_gateway/contracts/sessions.py:151` sagt dagegen:
DB-Zeile beim ersten Prompt, sofern keine Seed-Historie vorhanden ist.
`methods_session.py:473` bestätigt lazy lokale Drafts.
`stored_session_id` ist deshalb noch kein Nachweis erfolgreicher Persistenz.
Drafts flüchtig anzeigen; Reload ohne Prompt nicht als garantierte dauerhafte
Session verkaufen. Keine Wrapt-Transkriptkopie zur Kompensation anlegen.

### M3: UX-Ereignisse sind ein internes Modell, keine Gateway-Methoden

UX-Paper nennt `run.started/completed`, `request.opened/answered` und
`queue.changed` als Hermes-Ereignisse. Diese Namen sind nicht durch die
installierte Protokollmatrix belegt. Dort stehen unter anderem `session.info`,
`message.complete`, JSON-RPC-Serverrequests und `request.cancel`.
Eine explizite Normalisierungstabelle schreiben und unvollständige Zustände
als unbekannt behandeln. Kein Working aus alten REST-Zeitheuristiken ableiten:
`session-service.ts:151-153` nutzt einen Fünf-Minuten-Zeitraum.

### M4: Metadaten-Scope und Broadcast müssen zusammenpassen

UX-Paper schlägt eine Tabelle nur nach Hermes-Session-ID vor und behauptet
Konvergenz durch Serverpersistenz. Das Inventar korrigiert den Principal-Scope
und ergänzt Revisionen. Maßgeblich ist `(principal, stored_session_id)`;
bei späterer Profilunterstützung zusätzlich ein stabiler Profilscope.
REST-Schreiben allein aktualisiert andere Clients nicht.
BroadcastChannel erreicht keine anderen Geräte. Server-Fanout bzw. eine
definierte Invalidierung bleibt erforderlich. CAS-Undo und monotone Visits
testen, damit ein spät eintreffender Visit Mark-unread nicht ungewollt aufhebt.

### M5: Flag-off und weiterlaufende Arbeit brauchen getrennte Lebenszyklen

Inventar verspricht gleichzeitig null V2-Verbindungen bei Flag aus und
weiterlaufende Arbeit bei UI-Navigation. Für Phase 1 einfach erfüllbar, da
noch kein Transport existiert. Vor Phase 2 unterscheiden: Browser-Subscription
schließen, aber Hermes-Turn nicht schließen/unterbrechen.
Entscheiden, ob ein Manager mit aktiver Arbeit weiterlebt und wann ein inaktiver
Manager entsorgt wird. `close_on_disconnect:false` explizit setzen.
Backoff, Pending-RPC-Timeouts, Sendqueue, Manager-Cap und Shutdown spezifizieren.

### M6: Vertragsmarker ist beim Ready-Handshake nicht garantiert

Inventar nennt Epoch-/Contractprüfung beim Handshake. Das dokumentierte
`gateway.ready` enthält Replay-Epoche und Fähigkeiten, aber keinen
`desktop_contract`. Dieser steht im installierten Session-Info-Vertrag.
Bereits lesende Replies streng validieren; eine erfolgreiche Ready-/List-Probe
belegt noch keine Create-/Resume-/Request-Kompatibilität.
Vertragsprüfung an der tatsächlich verfügbaren Stelle durchführen und bei
abweichenden Shapes Mutationen sperren. Automatisches Hermes-Update vermeiden.

## Bestätigte technische Entscheidungen

- `HermesShell` ist die gemeinsame sichtbare Grenze für Route, Panel und Orbit.
  V1 nutzt `HermesAdminFrame`; dessen Pfad-/Aktivitätslogik erhalten.
- Dashboard `/api/ws` delegiert im selben Prozess direkt an
  `tui_gateway.ws.handle_ws`, siehe `hermes_cli/web_routers/chat_ws.py:701-719`.
  Ein zusätzlicher Serve-Prozess ist für diese Installation unbegründet.
- `HermesSessionToken` kapselt serverseitiges Laden und Invalidieren;
  Upstream-Adresse aus bestehender Konfiguration ableiten, 9119 nicht hardcoden.
- Wrapt-eigener Singleton-Manager je Principal mit fachlicher Allowlist,
  getrennten Live-/Stored-IDs und Request-Registry ist die richtige Richtung.
- Hermes bleibt Source of Truth. Getrennte UI-Metadaten in bestehender
  Wrapt-SQLite-Datei sind zulässig; kein zusätzlicher Chat-/Agent-State-Store.
- `7005b7e`: alte native Komponenten und ACP-Hook vorhanden.
  Hook-Cleanup schließt Socket; Close-Handler plant unbedingten Reconnect.
  Diese Lebenszykluslogik nicht wiederverwenden.
- `026bd3ec`: native/official-Umschaltung und Abschaltung nativer Queries
  vorhanden. `9f7508ee`: offizieller SPA-Umbau, 1767 entfernte Zeilen.
  Commit belegt keine behauptete tiefere Ursache oder Gateway-Inkompatibilität.
- Vorhandene `marked`, `dompurify`, `highlight.js`, `ws`, Zod reichen als Basis.
  Bestehende ACP-Contracts nicht als V2-Gateway-Vertrag umdeuten.

## Exakte Phase-1-Dateimap

Pfadpräfix für die folgenden Frontenddateien: `apps/web/src/`.

Bestehende Dateien ändern:

- `stores/appPreferences.ts`: Boolean-Flag, Setter, Persistierung, Migration,
  sichere Merge-Defaults und idempotenter Tab-Abgleich.
- `stores/appPreferences.test.ts`: v1-Migration erhält Startseite, false-Default,
  ungültige Werte, Reload und fremdes Storage-Event ohne Echo-Schleife.
- `views/settings/SettingsEasterEggs.tsx`: kleine Featurekarte einhängen.
- `lib/settingsSearch.ts`: Easter-Egg-Sucheintrag mit existierendem DOM-Anker.
- `lib/settingsSearch.test.ts`: Hermes-V2-Suche und Zielanker prüfen.
- `components/hermes/HermesShell.tsx`: Flag-/Classic-Auswahl, Lazy-V2-Grenze;
  Classic-Inhalt in benanntes Modul extrahieren, URL-/Panelprops weitergeben.
- `extensions/builtinContributions.ts`: idempotenten Feature-Bootstrap aufrufen.

Neue Dateien:

- `views/settings/HermesV2Settings.tsx`: Toggle und Öffnen-Aktion, kein Gateway.
- `views/settings/HermesV2Settings.test.tsx`: Beschriftung, Toggle, Öffnen-Ziel.
- `extensions/hermesV2Builtins.ts`: zwei Pages/Routes, normale Shell und echte
  Standalone-Contribution; keine neue konkurrierende Hermes-Hauptnavigation.
- `extensions/hermesV2Builtins.test.ts`: Pfade ohne basename, Shell-Flags,
  Lazy-Loader, doppelte Registrierung, keine Änderung der Legacy-Registrierungen.
- `views/HermesV2Route.tsx`: beide Route-Exports mit gemeinsamer V2-Shell;
  bei false ausschließlich Aktivierungseinstieg.
- `views/HermesV2Route.test.tsx`: Direktaufruf, Refresh-Modell, Flagwechsel,
  Standalone-Ausgabe und Classic-Rückweg.
- `components/hermes/HermesClassicShell.tsx`: bisherige Classic-Implementierung
  mit identischer Pfad-/Aktivitäts-/Panelpersistenz.
- `components/hermes/HermesShell.test.tsx`: route/panel/orbit, false unverändert,
  true nativ, explizites Classic/Admin-Deep-Link, Umschalten ohne Dateneingriff.
- `components/hermes/v2/HermesV2Shell.tsx`: leere native Wrapt-Fläche, gemeinsame
  Verwendung normal/Standalone, Classic-Aktion; keinerlei Chattransport.
- `components/hermes/v2/hermes-v2.css`: ausschließlich vorhandene Tokens,
  featurelokal importiert, ohne `.hermes-shell`-Adminfarben.
- `lib/hermesV2Routes.ts` und `lib/hermesV2Routes.test.ts`: BASE_URL-sicherer
  URL-Bau für neue Fenster sowie Erhalt von Session-Deep-Links.
- `tests/e2e/hermes-v2.spec.ts` im Repo-Root: off/on/Reload/Standalone,
  Classic-Fallback und keine V2-WS-/Fetch-Aufrufe bei off.

Bestehende `tests/e2e/hermes.spec.ts` und `hermes-mobile.spec.ts` unverändert
als V1-Regression ausführen. Vorhandene Frame-Tests weiter verwenden.
Kein Backend, kein SQLite-Schema und kein öffentlicher Gateway-Contract in Phase 1.
`App.tsx`, `legacyPageRoutes.ts`, `index.css` und Contracts-Barrel müssen dafür
nicht geändert werden. Loader kann featurelokal `loadRouteWithRecovery` nutzen.
Falls doch Änderungen an `index.css` (5064 Zeilen) oder Contracts-Barrel
(1841 Zeilen) nötig werden, zuerst fachlich sinnvoll extrahieren; nicht wachsen
lassen. Package-Subpath für spätere V2-Contracts ist eine separate Phase-2-Entscheidung.

## Ausgeführte Prüfungen und Evidenzgrenzen

- `pnpm architecture:file-lines`: Exit 0, 1624 Dateien geprüft.
- `pnpm typecheck`: Exit 0 einschließlich Server, Web und E2E-Typen.
- `pnpm --filter @wrapt/web test` mit `appPreferences.test.ts`,
  `HermesAdminFrame.test.tsx`, `hermesAdminFrame.test.ts`,
  `pageRouteRegistry.test.ts`, `legacyPageRoutes.test.ts`,
  `routeModules.test.ts`: 6 Dateien, 23 Tests bestanden.
- Alte Commits per lokalem `git show` geprüft, aktuelle Sicherheits-Hooks,
  Hermes-Routen, Tokenclient, Session-Normalisierung, Bootstrap, Routehost,
  Preferences, Settings und installierte Python-Verträge gelesen.
- Bereits vom Parent nachgewiesener authentifizierter Ready-/Session-list-Smoke
  wird akzeptiert; hier nicht erneut ausgeführt. Kein Modellturn, Approval,
  Replay, Parallel-Writer oder tatsächlicher Runtime-Vertragsmarker getestet.
- Keine Browserprüfung, da Phase 0 keine sichtbare UI ändert und Dienste
  ausdrücklich ausgeschlossen sind. Phase 1 benötigt Playwright-MCP-Prüfung
  auf eigener isolierter Instanz gemäß Projektregeln.
- T3-Commit, aktuelles Hermes-main, vollständige API-Matrix und Lizenzdetails
  sind teilweise Research-Belege, nicht jede Methode wurde unabhängig ausgeführt.
  Insbesondere keine Garantie für globale Working-Erkennung fremder Prozesse,
  serverseitige History-Pagination oder vollständige Queue-Steuerung.

Freigabebedingung: H1/H2/H5 im Inventar korrigieren und gezielt erneut
prüfen. Danach Phase 1. H3/H4 und M2-M6 vor dem jeweiligen Transport-/State-Gate
in Verträge und Tests überführen. Allein grüne Baseline-Tests sind keine
Freigabe für den noch nicht implementierten V2-Transport.
