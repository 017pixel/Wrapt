# Plan: Lokale Previews und iframe-Browser implementierungsreif optimieren

Status: **Überarbeitet nach Architektur- und Sicherheitsreview; bereit zur Bestätigung**\
Datum: **28.07.2026**\
Vorgänger: [plans/01_previews-und-browser-neu.md](./01_previews-und-browser-neu.md)

## 1. Ziel und bewusst begrenzter Scope

Lokale Development-Previews sollen auf Desktop, Tablet und Smartphone direkt, schnell
und reproduzierbar im Client-Browser laufen. Direkte iframe-Slot-Origins bleiben dafür
der Standard.

Dieser Plan liefert:

- einzelne Previews und Preview-Gruppen im Infinite Canvas,
- dieselbe Runtime in Sidebar, Vollbildroute und lokalem Browser-Panel,
- SPA-, MPA- und Full-Stack-Projekte mit mehreren Devservern,
- HTTP, WebSocket, EventSource, HMR und explizit konfigurierte Service-Abhängigkeiten,
- stabile Geräteansichten ohne weiße Skalierungsartefakte,
- eine sichere, als Best-Effort gekennzeichnete Diagnose,
- serverseitige Gerätepräferenzen,
- opt-in Synchronisierung kleiner localStorage-Snapshots,
- sichere Slot-Lebenszyklen ohne Vermischung verschiedener Projekte,
- automatisierbare lokale Tests und getrennte manuelle Tailscale-Abnahmen.

### Nicht Teil dieser Umsetzung

- Ein iframe ersetzt keinen allgemeinen Webbrowser für beliebige externe Websites.
- Server-Chromium wird in diesem Vorhaben nicht entfernt.
- Cookie-Profile, externe Websites, WebAuthn-/OAuth-Sonderfälle und Seiten mit
  Embedding-Schutz bleiben im Server-Chromium oder werden im echten Client-Browser
  geöffnet.
- Es gibt keine generische Live-Synchronisierung von IndexedDB, sessionStorage,
  Cache Storage, Service-Worker-Registrierungen, Browser-Cookies oder Credential Stores.
- Agenten verändern nicht automatisch Projektquellcode, CORS-Konfigurationen oder
  Startskripte.
- Globale Agent-Dateien außerhalb des Repositories werden nicht automatisch verändert.

Damit wird die schnelle lokale Preview optimiert, ohne technisch nicht haltbare
Browser- oder Storage-Versprechen zu machen.

## 2. Verbindliche Produktentscheidungen

| Bereich | Entscheidung |
|---|---|
| Lokale Previews | Direkte iframes über dedizierte Preview-Slot-Origins sind Standard |
| Externe Websites | Im Client-Browser öffnen oder explizit Server-Chromium verwenden |
| Server-Chromium | Bleibt für externe Seiten und Cookie-/Profil-Isolation erhalten |
| Browser-Profile | Werden weder migriert noch gelöscht |
| Geräte-Default | Benutzerpräferenz, initial iPhone 13 mit 390 × 844 CSS-Pixel |
| Slot-Gerät | `null` bedeutet Benutzerpräferenz; explizite Auswahl bleibt slotgebunden |
| Eingabe | Desktop bleibt Maus/Tastatur; echte Touch-Geräte liefern native Touch-/Pointer-Ereignisse |
| Cookie-Isolation | Nicht über Ports möglich; UI zeigt diese Grenze deutlich an |
| App-Speicher | MVP nur opt-in localStorage-Snapshots; kein transparenter generischer Vollsync |
| IndexedDB | Nur Machbarkeitsspitze nach abgeschlossenem MVP; kein Bestandteil der Definition of Done |
| Diagnose | Best Effort, nach Datenquelle gekennzeichnet und standardmäßig eingeklappt |
| Netzwerkdiagnose | Gateway- und Client-Daten getrennt; keine behauptete CDP-Vollständigkeit |
| Logs | Sieben Tage, sichere Redaction, Größenlimits, Batching und Drop-Zähler |
| Rohdiagnose | Zeitlich begrenztes Opt-in; Cookies und Authorization-Werte werden immer ausgeschlossen |
| Service-Graph | Automatische Vorschläge; Verbindung erst nach Benutzerbestätigung |
| Reparatur | Nur feste, validierte Aktionen; keine Shell- oder Quellcodeänderungen |
| Sprache | Deutsch für UI, Kommentare und Dokumentation |

## 3. Technische Grenzen und unterstützte Matrix

### 3.1 Geräteemulation

Ein iframe kann Viewport-Maße darstellen, aber auf einem Desktop weder die echte DPR
eines iPhones noch dessen Browserengine, Safe-Area-Berechnung oder vollständige
Touch-Hardware emulieren.

Verbindlich unterstützt:

- exakte iframe-CSS-Maße aus dem Preset,
- Portrait/Landscape,
- visuelle Notch/Dynamic Island/Home-Indikator,
- native Eingaben des verwendeten Geräts,
- sichtbarer Hinweis, dass DPR und Safe Area nur angenähert sind.

Nicht behauptet:

- vollständiger Chrome-Device-Mode,
- Maus-zu-Touch-Konvertierung,
- echte iOS-Safari-Engine auf einem Desktop-Browser.

### 3.2 Storage und Cookies

| Speicher | Slot-isoliert | Automatisch beobachtbar | Cross-Device-MVP |
|---|---:|---:|---:|
| localStorage | Ja, pro Origin | Mit Bridge überwiegend | Opt-in Snapshot |
| sessionStorage | Ja, pro Browsing Context | Teilweise | Nein |
| IndexedDB | Ja, pro Origin | Nicht vollständig | Nein |
| Cache Storage | Ja, pro Origin | Nicht vollständig | Nein |
| Service Worker | Ja, pro Origin | Nicht als Datenobjekt syncbar | Nein |
| Host-Cookies | Nein, Ports werden ignoriert | HttpOnly nicht lesbar | Nein |
| Credential Stores | Browserintern | Nein | Nein |

„Gleicher App-Zustand auf zwei Geräten“ bedeutet im MVP ausschließlich einen bewusst
exportierten beziehungsweise automatisch begrenzt gesicherten localStorage-Snapshot.
Es bedeutet nicht, dass Logins, HttpOnly-Cookies oder beliebige Offline-Daten übertragen
werden.

### 3.3 Diagnoseabdeckung

Jedes Diagnoseereignis erhält eine Quelle:

- `client` — Console, JavaScript-Fehler, Fetch/XHR und Performance API,
- `gateway` — HTTP-Proxy, Status, Laufzeit, Redirects und Weiterleitungsfehler,
- `socket` — WebSocket-/EventSource-Verbindungszustand,
- `system` — Slot, Tailscale, Lease, Reset und Service-Graph,
- `inferred` — als Vermutung gekennzeichnete CORS-/Routingursache.

Die UI zeigt keinen CDP- oder DevTools-Vollständigkeitsanspruch. Requests aus Workern,
Service Workern oder Browser-internen Mechanismen können unvollständig sein.

## 4. Ist-Zustand im Repository

Bereits vorhanden:

- Preview-Slot-Listener und SQLite-Persistenz in
  `apps/server/src/previews/slots.ts`,
- interne und öffentliche Portlisten in zentraler Config,
- HTTP-/WebSocket-Root-Proxy,
- gespeicherte Dependency-Regeln,
- Runtime-Bridge für Fetch, XHR, WebSocket, EventSource und Beacon,
- Orbit-Nodes für `previewGroup` und `previewSlot`,
- iPhone-13-Preset und Default für neu erzeugte Orbit-Slots,
- Device-Shell und Skalierung,
- Server-Chromium mit Profilen und CDP-Inspector,
- serverseitige Tailscale-Identität in Terminal- und Browser-Routen,
- Unit-Tests für Slot-Proxy sowie UI-/Orbit-E2E-Tests.

Konkrete Lücken:

- Session-Bindings und `preview_slots.target_port` werden nicht in einer gemeinsamen
  atomaren Operation veröffentlicht.
- Ein geteilter Slot kann mehreren Sessions zugeordnet sein, während die Laufzeit nur
  eine Session als Kontext auswählt.
- Preview-APIs besitzen noch keine Benutzer- und Ownership-Prüfung.
- Eine freigegebene Slot-Origin behält Browser-Storage und Service Worker.
- HTML-Injektion puffert ungegrenzt, nimmt UTF-8 an und arbeitet mit Regex.
- Der Proxy entfernt aktuell die gesamte CSP und `X-Frame-Options`.
- „auto“ bei Dependency-Protokollen wird zur Laufzeit nicht verlässlich aufgelöst.
- Der Bridge-Kontext existiert nur bei mehreren verbundenen Diensten.
- Client- und Gateway-Diagnose fehlen.
- BrowserPanel, ToolPanel und einzelne Orbit-Fallbacks starten noch responsive.
- Bestehende E2E-Mocks decken die aktuelle Session-API nur teilweise ab.

### Normative technische Referenzen

- [HTML Standard: Cross-document messaging](https://html.spec.whatwg.org/multipage/web-messaging.html)
- [RFC 6454: The Web Origin Concept](https://www.rfc-editor.org/rfc/rfc6454)
- [RFC 10025: Cookies](https://www.rfc-editor.org/rfc/rfc10025)
- [Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB-3/)
- [Service Workers](https://www.w3.org/TR/service-workers/)
- [Clear-Site-Data](https://www.w3.org/TR/clear-site-data/)
- [Chrome: Device Mode](https://developer.chrome.com/docs/devtools/device-mode)
- [Chrome: Clickjacking-Schutz mit CSP/X-Frame-Options](https://developer.chrome.com/docs/lighthouse/best-practices/clickjacking-mitigation)

## 5. Zielarchitektur

```text
Projektprozesse
  └─ sichere Port-Erkennung
       └─ Service-Vorschläge
            └─ bestätigter Service-Graph
                 └─ atomare Routing-Snapshot-Revision
                      ├─ Slot-Origin A ─ lokale App
                      ├─ Slot-Origin B ─ bestätigte API
                      └─ Slot-Origin C ─ bestätigter Socket

Slot-Origin
  ├─ Root-Proxy
  ├─ reservierte Bridge-Ressource
  ├─ Slot-Affinität + Generation
  ├─ Client-Diagnose per postMessage an die Workbench
  └─ kontrollierter Storage-Reset vor fremder Wiederverwendung

Workbench-Origin
  ├─ Benutzeridentität und Ownership
  ├─ Diagnose-Ringpuffer im Client
  ├─ gebatchte, redigierte JSONL-Logs
  ├─ localStorage-Snapshot-API
  └─ sichere Repair-/Probe-API
```

### Architekturregeln

1. Eine Slot-Origin besitzt zu jedem Zeitpunkt genau eine App-/Storage-Affinität.
2. Eine Routing-Revision wird vollständig oder gar nicht sichtbar.
3. Ein Slot darf nicht still zwischen unterschiedlichen Storage-Eigentümern wechseln.
4. Mehrere Sessions dürfen einen Slot nur teilen, wenn Routing-Graph,
   Storage-Affinität und Sicherheitskontext identisch sind.
5. Preview-Inhalt ist nicht vertrauenswürdig und darf keine privilegierten
   Reparaturaktionen über `postMessage` auslösen.
6. Externe URLs werden nie durch den lokalen Preview-Gateway geproxyt.
7. Diagnose und Storage-Snapshot dürfen das Rendering nie blockieren.
8. Jede Phase besitzt einen Rollback-Schalter und ein messbares Exit-Gate.

## 6. Identitäten und Schlüssel

Folgende Schlüssel werden nicht vermischt:

- `userId`: normalisierte, erlaubte Tailscale-Login-Adresse aus vertrauenswürdigem
  Proxy-Header; nie aus Request-Body oder Query.
- `clientId`: zufällige ID pro Workbench-Browserprofil, nur für Diagnose/Konflikte,
  nicht zur Autorisierung.
- `previewNodeId`: Orbit-Knoten.
- `sessionId`: serverseitige UUID einer aktiven Preview-Session.
- `sessionKey`: clientseitiger idempotenter Schlüssel, serverseitig immer zusammen
  mit `userId` ausgewertet.
- `storageProfileId`: stabile UUID eines Preview-Slots im Orbit-Dokument.
- `storageOwnerKey`: serverseitig abgeleiteter Schlüssel aus Projekt,
  Preview-Definition und Storage-Profil; niemals freie URL.
- `slotId`: konfigurierter technischer Slot.
- `slotGeneration`: wird bei kontrollierter Übernahme durch einen anderen
  `storageOwnerKey` erhöht.
- `routingRevision`: monotone Revision des atomaren Routing-Snapshots.
- `bridgeSessionId`: kurzlebige ID pro iframe-Dokument.

Für lokale Entwicklung darf die bestehende Vite-Konfiguration einen expliziten
`WORKBENCH_DEV_TAILSCALE_USER` setzen. Produktion akzeptiert keinen Identitätsfallback.

## 7. Verträge und Migrationen

### 7.1 Contracts zuerst

In `packages/contracts/src/index.ts` werden abgegrenzte Module beziehungsweise klar
benannte Schemas ergänzt.

#### Geräte

- `previewDevicePreferenceSchema`
  - `deviceId`,
  - `orientation`,
  - `updatedAt`.
- Benutzeridentität wird nicht vom Client übertragen.

#### Slot und Session

- `previewSlotStateSchema`: `free | active | resetting | quarantined`.
- `previewSlotSchema` zusätzlich mit:
  - `state`,
  - `storageProfileId`,
  - `slotGeneration`,
  - `routingRevision`,
  - `affinityStatus`,
  - niemals mit internem `storageOwnerKey`.
- `previewSessionRequestSchema` zusätzlich mit:
  - `storageProfileId`,
  - `expectedRoutingRevision` optional,
  - `idempotencyKey`.
- `previewSessionResponseSchema` zusätzlich mit:
  - `routingRevision`,
  - `bridgeVersion`,
  - `capabilities`,
  - `limitations`.

#### Service-Graph

- `previewServiceCandidateSchema` für reine Vorschläge.
- `previewServiceGraphSchema` für bestätigte Kanten:
  - Dienst-ID,
  - Projekt-ID,
  - Port,
  - Protokoll,
  - Rolle,
  - Probe-Status,
  - Quelle `manual | detected`,
  - Bestätigungszeit.
- Keine Konfigurationsdatei wird ausgeführt; nur statische Metadaten werden gelesen.

#### Diagnose

- `previewDiagnosticEventSchema` mit:
  - Event-ID, Zeit, Quelle, Kategorie, Severity,
  - Session-, Preview-, Slot- und Routing-Revision,
  - Route und redigierten Metadaten,
  - `completeness: complete | partial | inferred`,
  - begrenzter Payload.
- `previewDiagnosticBatchSchema`: maximal 100 Events und maximal 256 KiB.
- `previewDiagnosticsResponseSchema`: gefilterte Events, Drop-Zähler und Logreferenz.

#### localStorage-Snapshots

- `previewLocalStorageSnapshotSchema`:
  - `storageProfileId`,
  - Revision,
  - Zeit,
  - Anzahl Schlüssel,
  - UTF-8-Bytezahl,
  - komprimierte Nutzlast,
  - Hash,
  - Bridge-Version.
- `previewLocalStorageRestoreRequestSchema` mit `expectedRevision`.
- Werte bleiben Strings, entsprechend der nativen localStorage-Semantik.
- Kein allgemeiner Structured-Clone-Codec im MVP.

#### Reparatur

Erlaubte Aktionen:

- `probe-services`,
- `rebuild-suggestions`,
- `renew-own-session`,
- `release-own-session`,
- `reset-slot-storage` nach expliziter Bestätigung,
- `clear-quarantine` nur nach erfolgreicher Reset-Verifikation.

Nicht erlaubt:

- Shell-Kommandos,
- Dateischreibzugriff,
- CORS-/Projektcodeänderung,
- fremde Sessions schließen,
- Remote-iframe ohne verbundenen Client „neu laden“.

### 7.2 Orbit-Migration auf Version 7

- `previewStorageProfileId` wird für jeden echten Preview-Slot als UUID ergänzt.
- Referenzgruppen verwenden weiterhin das Profil des kanonischen Slots.
- Für Dokumente bis Version 6 wird `previewDeviceId: null` als explizites
  `"responsive"` migriert, damit der bisher sichtbare Zustand erhalten bleibt.
- Neu erzeugte Slots speichern `previewDeviceId: null` und erben die
  Benutzerpräferenz.
- Explizite Gerätewerte bleiben unverändert.
- `previewRuntime: "shared-browser"` bleibt erhalten und wird nicht automatisch
  migriert.
- Bestehende Browser-Panel-Zustände und Browserprofile bleiben unangetastet.
- Vor der Migration wird wie bisher eine Orbit-Revisionssicherung geschrieben.
- Parser akzeptieren während einer Release-Übergangsphase Version 6 und 7.

### 7.3 Datenbankmigration

Die vorhandene externe Workbench-SQLite bleibt die einzige Datenbankdatei.
Preview-Tabellen werden in einem klaren Repository-Modul verwaltet.

Neue Tabellen:

- `preview_device_preferences`
  - Primärschlüssel `user_id`.
- `preview_runtime_sessions`
  - eindeutiger Schlüssel `(user_id, session_key)`.
- `preview_session_bindings`
  - Session, Slot, Rolle, Ziel, Protokoll und Routing-Revision.
- `preview_slot_affinities`
  - Slot, Storage-Profil, Generation, Status, letzter verifizierter Reset.
- `preview_service_candidates`
  - kurzlebige Erkennungsvorschläge.
- `preview_service_graphs`
  - bestätigte Graphen.
- `preview_local_storage_snapshots`
  - aktuelle und maximal drei historische, verschlüsselte Revisionen pro
    Benutzer/Profil.
- `preview_repair_audit`
  - Benutzer, Aktion, Ziel, Vorher-/Nachherzustand und Ergebnis.

Bewusst keine Tabelle:

- `preview_diagnostic_events`.

Diagnose lebt im Client-Ringpuffer und in redigierten JSONL-Dateien. Damit gibt es
keine doppelte dauerhafte Quelle der Wahrheit.

Migrationseigenschaften:

- `PRAGMA foreign_keys=ON`,
- `WAL`, `busy_timeout` und geeignete Indizes,
- alle Binding-/Slot-Änderungen unter `BEGIN IMMEDIATE`,
- inkrementelle `preview_schema_migrations`,
- Datenverzeichnis `0700`, neue Log-/Snapshot-Dateien `0600`,
- keine Löschung alter Browserprofildaten.

Snapshot-Verschlüsselung:

- Beim ersten Aktivieren des Storage-MVP wird
  `<paths.dataDir>/preview-storage.key` mit 32 kryptografisch zufälligen Bytes und
  Dateimodus `0600` erzeugt.
- localStorage-Nutzlast wird vor SQLite mit AES-256-GCM verschlüsselt.
- Jede Revision erhält einen neuen 96-Bit-IV.
- `userId`, `storageProfileId`, Revision und Klartext-Hash werden als Additional
  Authenticated Data gebunden.
- SQLite speichert Ciphertext, IV und Auth-Tag, niemals den Klartext.
- Der Schlüssel wird nie über API, Log oder Export ausgegeben.
- Fehlt oder wechselt der Schlüssel, werden betroffene Snapshots als
  `unavailable` markiert; die Preview startet weiterhin und überschreibt nichts
  automatisch.

## 8. API-Design und Autorisierung

### 8.1 Gemeinsame Sicherheitsregeln

- Jede Preview-API löst zuerst `userId` auf und prüft die Allowlist.
- Browserseitige mutierende HTTP-Endpunkte verlangen eine gültige Same-Origin-Anfrage.
- WebSocket-Verbindungen prüfen Origin und Benutzeridentität beim Upgrade.
- Benutzer dürfen nur eigene Sessions, Präferenzen, Snapshots und Repair-Jobs sehen.
- Slotstatus anderer Benutzer wird nur aggregiert als `belegt` angezeigt.
- Ports müssen zu einem bekannten Projektprozess gehören oder als manueller lokaler
  Port bewusst bestätigt worden sein.
- Loopback, Infrastrukturports und nicht erlaubte Protokolle bleiben blockiert.
- Request-Bodies, Batchgrößen und Feldlängen sind in Zod begrenzt.

Lokaler Doctor-/Agentenzugriff:

- Beim ersten Start wird unter
  `<paths.dataDir>/preview-agent-capability` ein zufälliges Capability-Token mit
  Dateimodus `0600` erzeugt.
- Das Token wird nie an das Webfrontend, in Logs oder API-Antworten ausgegeben.
- `scripts/preview-doctor.sh` liest es lokal und sendet es als Bearer-Token.
- Capability-Zugriff wird nur bei direkter Loopback-Verbindung akzeptiert.
- Er darf systemweite Probes, Vorschlagsneubau, Routing-Snapshot-Neubau und das
  Freigeben bereits abgelaufener Leases auslösen.
- Er darf redigierte Preview-Logs mit verpflichtendem Zeitraumfilter von maximal
  sieben Tagen lesen.
- Er darf keine aktive Benutzersession schließen, keinen Storage-Reset bestätigen,
  keinen Storage-Snapshot lesen, keine unredigierten Logdaten anfordern und keine
  Benutzerpräferenz verändern.
- Storage-Reset und andere benutzerbezogene Mutationen bleiben an Tailscale-Identität,
  Same-Origin-Prüfung und sichtbare UI-Bestätigung gebunden.
- Jede Capability-Aktion wird als Akteur `local-agent` auditiert.

### 8.2 Endpunkte

Geräte:

- `GET /api/v1/previews/device-preference`
- `PUT /api/v1/previews/device-preference`

Slots und Sessions:

- `GET /api/v1/previews/slots`
- `POST /api/v1/previews/sessions`
- `PUT /api/v1/previews/sessions/:sessionId/lease`
- `DELETE /api/v1/previews/sessions/:sessionId`
- Die alte freie `PUT /previews/slots`-Mutation bleibt nur während der Migration
  intern kompatibel und wird anschließend entfernt.

Slot-Reset:

- `POST /api/v1/previews/slots/:slotId/reset`
  - erzeugt Nonce, setzt Status `resetting`, prüft Ownership und verlangt
    `expectedGeneration`.
- `POST /api/v1/previews/slots/:slotId/reset/verify`
  - akzeptiert ausschließlich den verifizierten Resetbericht der Workbench,
    erhöht Generation und hebt Quarantäne auf.

Service-Graph:

- `GET /api/v1/previews/service-candidates?projectId=...`
- `POST /api/v1/previews/service-candidates/scan`
- `GET /api/v1/previews/service-graphs/:projectId/:primaryServiceId`
- `PUT /api/v1/previews/service-graphs/:projectId/:primaryServiceId`

Diagnose:

- `POST /api/v1/previews/diagnostics/batches`
- `GET /api/v1/previews/diagnostics?previewNodeId=...&since=...`
- `GET /api/v1/previews/diagnostics/log-tail?...`
- `POST /api/v1/previews/diagnostics/capture-session`
- `DELETE /api/v1/previews/diagnostics/capture-session/:id`
- `GET /api/v1/previews/doctor/logs?since=...&previewNodeId=...&severity=...`
  - nur Loopback-Capability,
  - ausschließlich redigierte Ausgabe,
  - maximal sieben Tage.

localStorage:

- `GET /api/v1/previews/storage/:storageProfileId`
- `POST /api/v1/previews/storage/:storageProfileId/snapshots`
- `POST /api/v1/previews/storage/:storageProfileId/restore`
- `DELETE /api/v1/previews/storage/:storageProfileId`

Repair:

- `POST /api/v1/previews/repair`
- `GET /api/v1/previews/repair/:jobId`

Alle Mutationen unterstützen Idempotenz beziehungsweise erwartete Revisionen. Ein
Konflikt antwortet mit `409` und aktuellem, autorisiertem Metadatenstand.

## 9. Phase 0 — Machbarkeitsspitzen und Sicherheitsgates

Vor produktiven Schemaänderungen werden vier kleine, wegwerfbare Spikes geschrieben.

### Spike A: Slot-Reset

Nachweisen:

- Bridge unregistert alle sichtbaren Service Worker der Slot-Origin.
- Cache Storage, localStorage, sessionStorage und per `indexedDB.databases()` sichtbare
  Datenbanken werden gelöscht.
- Eine reservierte Netzwerkroute liefert zusätzlich
  `Clear-Site-Data: "cache", "storage", "executionContexts"`, niemals `"cookies"`.
- Reset wird durch erneute Bridge-Inventur verifiziert.
- Kann die Origin nicht sicher bereinigt werden, bleibt der Slot `quarantined`.

Go-Kriterium:

- Alte App kann nach Reset weder Service Worker noch localStorage-/IndexedDB-Schlüssel
  in einer Test-App nachweisen.

No-Go-Folge:

- Slot bleibt dauerhaft an seinen `storageOwnerKey` gebunden; fremde Wiederverwendung
  wird nicht implementiert.

### Spike B: HTML-Injektion

Nachweisen:

- HTML bis zum konfigurierten Limit wird korrekt erkannt.
- `parse5` injiziert genau ein externes Bridge-Script in `head`.
- Dokumente ohne `head` werden unterstützt.
- UTF-8, Content-Length, Content-Encoding und Status bleiben korrekt.
- Nicht-UTF-8, zu große oder nicht parsebare Antworten werden unverändert
  weitergeleitet und als `bridgeUnavailable` diagnostiziert.

Die Bridge liegt unter einer reservierten Slot-Route:

```text
/__workbench/preview-bridge.v1.js
```

Die Route wird nie an den Devserver weitergereicht. Ein externes Script vermeidet
unnötiges `unsafe-inline`.

### Spike C: Diagnosekorrelation

Nachweisen:

- Parent akzeptiert nur Nachrichten von exakt `iframe.contentWindow` und erwarteter
  Slot-Origin.
- Parent vergibt `bridgeSessionId` und Navigationsepoch.
- Sequenzen werden nur innerhalb derselben Epoch verglichen.
- Vorschauinhalt kann keine Repair-API direkt auslösen.
- Gateway-Events werden mindestens Slot und Routing-Revision, aber nur dann einer
  Session zugeordnet, wenn die Zuordnung eindeutig ist.

### Spike D: localStorage-Snapshot

Nachweisen:

- maximal 256 KiB und 1.000 Schlüssel,
- deterministische Sortierung und Hash,
- Konflikt mit zwei Clients ergibt `409`,
- Restore ist eine explizite Benutzeraktion,
- Fehler deaktivieren niemals das iframe.

Exit-Gate Phase 0:

- Alle vier Spikes dokumentiert.
- No-Go-Entscheidungen sind im Plan nachgetragen.
- Keine produktive Migration vor bestandenem Slot-Reset-Spike.

## 10. Phase 1 — Atomarer Slot-Gateway

Betroffene Bereiche:

- `apps/server/src/previews/slots.ts`, anschließend in kleinere Module zerlegen:
  - `database.ts`,
  - `routing.ts`,
  - `gateway.ts`,
  - `bridge.ts`,
  - `reset.ts`,
- `apps/server/src/api/routes.ts`,
- `apps/server/src/app.ts`,
- `apps/server/src/config/settings.ts`,
- `apps/server/src/config/workbench-config.ts`,
- `apps/server/package.json`,
- `pnpm-lock.yaml`,
- `config/workbench.example.json`,
- `deploy/proxy/configure-tailscale-serve.sh`.

### 10.1 Atomare Veröffentlichung

- Session, Bindings, Slotstatus und Zielports werden in einer Transaktion geändert.
- Nach Commit erzeugt der Service einen unveränderlichen Routing-Snapshot.
- Listener lesen pro Request genau einen Snapshot.
- Der Snapshot wird erst nach erfolgreichem Commit atomar ausgetauscht.
- Fehler zwischen Datenbank-Commit und Snapshot-Swap lösen einen Neuaufbau aus der
  Datenbank aus; kein teilweiser Graph wird veröffentlicht.
- Geteilte Slots werden nur erlaubt, wenn der vollständige Binding-Fingerprint gleich ist.
- `sessionForSlot()` wird nicht mehr als mehrdeutige Kontextquelle verwendet.

### 10.2 HTTP und WebSocket

Unterstützt:

- `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH`, `DELETE`,
- HTTP und explizit erkanntes lokales HTTPS,
- WebSocket-Upgrades,
- EventSource/SSE ohne Antwortpufferung,
- Query und Hash auf Clientseite,
- MPA-Routen direkt am Root.

Headerregeln:

- Hop-by-Hop-Header entfernen.
- `Host` zeigt auf den lokalen Devserver.
- `X-Forwarded-Host`, `X-Forwarded-Proto` und `X-Forwarded-Port` zeigen die
  öffentliche Slot-Origin.
- `Location` und `Content-Location` werden nur für bekannte lokale Service-Origins
  umgeschrieben.
- `Link` wird mit einem echten Headerparser verarbeitet.
- `Set-Cookie` wird nicht als URL behandelt.
- `Domain=localhost` oder `Domain=127.0.0.1` erzeugt standardmäßig eine Diagnose,
  keine stille semantische Änderung.
- Cookies werden nie als slotisoliert dargestellt.

### 10.3 Embedding- und CSP-Policy

- Gateway akzeptiert ausschließlich bestätigte lokale Dienste.
- Für diese vertrauenswürdigen lokalen Devserver wird nur die Embedding-Regel angepasst:
  - `X-Frame-Options` entfernen,
  - `frame-ancestors` gezielt um die Workbench-Origin ergänzen.
- Der restliche CSP bleibt erhalten.
- Falls das externe Bridge-Script durch `script-src` blockiert wird, darf der Gateway
  für bestätigte lokale Dienste `'self'` ergänzen und protokolliert diese Änderung.
- Externe Websites durchlaufen diesen Gateway nie.
- Die Preview-Info zeigt jede geänderte Sicherheitsrichtlinie transparent an.

### 10.4 HTML-Bridge

- Injektion nur für `text/html`, UTF-8 und maximal
  `previews.maxInjectableHtmlBytes`.
- Standardlimit: 2 MiB, zentral konfigurierbar.
- `parse5` statt Regex.
- Marker verhindert Doppel-Injektion.
- Unsupported- oder Streaming-Antworten bleiben funktionsfähig, aber ohne Client-Bridge.
- Keine pauschale Umschreibung beliebiger JavaScript- oder CSS-Bundles.
- Unterstützte URL-Anpassung:
  - Fetch,
  - XHR,
  - WebSocket,
  - EventSource,
  - Beacon,
  - bekannte absolute Localhost-URLs in HTML-Attributen,
  - Import-Map-Einträge im HTML.
- Worker-interne Requests und statische Imports in gebündeltem JavaScript gelten als
  nicht garantiert und erscheinen als klarer Diagnosehinweis.

### 10.5 Slot-Affinität und Reset

- Freigeben beendet die Lease, löscht aber nicht automatisch die Affinität.
- Derselbe `storageOwnerKey` darf seinen Slot wiederverwenden.
- Ein anderer Owner benötigt erfolgreichen Reset und neue Generation.
- Resetfehler setzen `quarantined`; dieser Slot wird nicht automatisch vergeben.
- Cookies werden beim Reset nicht gelöscht, weil sie hostweit andere Slots betreffen
  können.
- UI weist bei Cookie-Apps auf den Chromium-Modus hin.

Exit-Gate Phase 1:

- Atomizitäts-, Race-, Reset-, Quarantäne- und Kapazitätstests grün.
- Keine externe URL kann als Preview-Ziel gespeichert werden.
- MPA, HMR, WebSocket und SSE funktionieren im lokalen Integrationsharness.
- Rollback: `previews.gatewayV2Enabled=false` verwendet den bisherigen Gateway.

## 11. Phase 2 — Gerätepräferenz und stabile Skalierung

### 11.1 Präferenzauflösung

Reihenfolge:

1. explizites `previewDeviceId` des Slots,
2. Benutzerpräferenz,
3. iPhone 13 Portrait.

Verhalten:

- Neue Slots speichern `previewDeviceId: null`.
- Ändert ein erbender Slot das Gerät, wird die Benutzerpräferenz aktualisiert und der
  Slot bleibt auf „Standard verwenden“.
- „Für diesen Slot festlegen“ schreibt einen expliziten Wert.
- „Standard verwenden“ setzt den Slot wieder auf `null`.
- Bestehende explizite Responsive-Slots bleiben Responsive.

### 11.2 Device-Shell

- Stage nutzt ausschließlich Design-Tokens.
- Shell, Rahmen und Screen teilen denselben Ursprung.
- Alle relevanten Layer clippen Überlauf.
- Sichtbare Außenkanten verwenden keine transformierten halben Border-Pixel.
- Berechnung nutzt `ResizeObserver`, gecanceltes `requestAnimationFrame` und eine
  einzige Scale-Aktualisierung pro Frame.
- Viewport bleibt logisch exakt; Gruppenresize ändert nur die Darstellung.
- Gegen weiße Haarlinien werden Clip-Überdeckung und maximal ein physischer Pixel
  kontrollierter Overdraw verwendet, nicht willkürliche Größenänderungen.
- Home-Indikator ist ein weißer, nicht interaktiver Layer im Screen-Clip.
- Notch und Dynamic Island bleiben rein visuell.

### 11.3 Interaktion

- iframe erhält native Browserinteraktion.
- Während Canvas-Drag/Resize liegt ein Workbench-Overlay über dem iframe.
- Canvas- und Inhaltsmodus bleiben auf Touchgeräten getrennt.
- Fokus, Tab-Reihenfolge, Pointer-Capture und `touch-action` werden getestet.
- Reload, Zurück, Vorwärts, Orientierung und Diagnose besitzen sichtbare Buttons.
- Der Plan behauptet nicht, Pointer-Ereignisse künstlich in das iframe einzuspeisen.

Exit-Gate Phase 2:

- Alle Gerätefallbacks konsistent.
- Screenshot-/Geometrietests bei DPR 1, 1.25, 1.5, 2 und 3 ohne sichtbare Kanten.
- iPhone-13-Inhalt bleibt 390 × 844 CSS-Pixel.
- Rollback: alter Device-Frame bleibt für eine Release-Version verfügbar.

## 12. Phase 3 — Service-Erkennung als Vorschlag

### 12.1 Erkennung

`localPortService` liefert zusätzlich:

- Listener, PID, Prozessname und Protokollprobe,
- kanonischen Prozess-CWD,
- bestes passendes registriertes Projekt,
- statisch gelesene `package.json`-Scripts,
- bekannte, rein statisch auswertbare Framework-Hinweise,
- Probe-Ergebnisse für HTTP, WebSocket und HMR.

Nicht erlaubt:

- Importieren oder Ausführen fremder Vite-/Next-/Svelte-Konfiguration,
- Shell über Benutzereingaben,
- Scans außerhalb registrierter Projektpfade,
- automatisches Verbinden bloß aufgrund derselben Prozessbezeichnung.

### 12.2 Bestätigung und Kapazität

- Erkannte Dienste erscheinen als Vorschläge.
- Benutzer bestätigt Rolle, Protokoll und Verbindung.
- Vor dem Speichern zeigt die UI:
  - benötigte Slots,
  - wiederverwendbare identische Bindings,
  - verbleibende Kapazität,
  - Cookie-/Origin-Einschränkungen.
- Ein Graph, der die Kapazität überschreitet, wird nicht teilweise aktiviert.
- Dependency-Slots dürfen über Sessions nur geteilt werden, wenn Binding-Fingerprint
  und Storage-Affinität identisch sind.

### 12.3 Doctor

`scripts/preview-doctor.sh` und Repair-API können:

- Ports und Protokolle erneut prüfen,
- gespeicherte Graphen gegen Listener vergleichen,
- falsche oder fehlende Kanten melden,
- eigene abgelaufene Sessions freigeben,
- Tailscale-Mappings lesend prüfen,
- Quarantäne und Resetstatus anzeigen,
- reproduzierbaren JSON-Bericht erzeugen.

Sie verändern keinen Projektcode. Korrekturen am Graphen benötigen Bestätigung.

Exit-Gate Phase 3:

- False-Positive-/Cross-Project-Tests grün.
- Kein Kandidat wird ohne Bestätigung verbunden.
- Doctor funktioniert ohne `sudo`.
- Tailscale-Änderungen bleiben ein separater administrativer Schritt.

## 13. Phase 4 — Diagnose-Bridge, Logging und UI

### 13.1 Bridge-Protokoll

Handshake:

1. Parent kennt iframe-Element und erwartete Slot-Origin.
2. Bridge meldet Bereitschaft mit Version und Dokumentepoch.
3. Parent vergibt `bridgeSessionId`.
4. Beide Seiten senden ausschließlich mit exaktem `targetOrigin`.
5. Parent prüft `event.source`, Origin, Schema, Epoch, Sequenz und Größenlimit.

Die Bridge ist kein Sicherheitsprincipal. Nachrichten aus dem Preview-Inhalt dürfen nur
Diagnosedaten und begrenzte localStorage-Daten liefern, niemals Repair-, Datei- oder
Shell-Aktionen auslösen.

Clientseitig erfassen:

- `console.debug`, `log`, `info`, `warn`, `error`,
- `window.onerror`,
- `unhandledrejection`,
- Ressourcenfehler aus DOM und Performance API,
- Navigation, DOMContentLoaded, Load und Pagehide,
- Fetch/XHR,
- WebSocket/EventSource soweit von der Bridge erzeugt,
- HMR-Hinweise soweit beobachtbar,
- begrenzte Performance-Timings.

Console-Serialisierung:

- maximale Tiefe 4,
- maximal 100 Eigenschaften pro Objekt,
- maximal 8 KiB pro String,
- maximal 64 KiB pro Event,
- Zyklen, DOM-Knoten, Funktionen, Fehler, BigInt und nicht lesbare Getter werden
  sicher beschrieben,
- Serializer ruft kein fremdes `toJSON` auf.

### 13.2 Gatewaydiagnose

Gateway erfasst:

- Methode, Pfad, Status und Laufzeit,
- Zielservice und Routing-Revision,
- Proxy-, Timeout- und Verbindungsfehler,
- Redirect-Umschreibungen,
- WebSocket-Open/-Close ohne Nachrichteninhalte,
- CORS-Metadaten ohne Secrets,
- Bridge-Injektionsstatus.

Eine Sessionzuordnung erfolgt nur bei Eindeutigkeit. Sonst bleibt das Ereignis auf
Slot-/Routing-Ebene.

### 13.3 Redaction und Rohdiagnose

Immer entfernt:

- `Authorization`,
- `Proxy-Authorization`,
- `Cookie`,
- `Set-Cookie`,
- bekannte Token-/Secret-Header,
- URL-Credentials.

Standardmäßig zusätzlich redigiert:

- Query-Werte bekannter Secret-Parameter,
- E-Mail-Adressen und Tokens in strukturierten Metadaten,
- Request-/Response-Bodies vollständig.

Persistierte Diagnoselogs verwenden für `userId` eine stabile HMAC-Pseudonym-ID.
Die echte Tailscale-Identität bleibt nur in autorisierten Audit-Datensätzen. Lokale
Dateipfade und Projektpfade werden nicht in Preview-JSONL geschrieben.
Der HMAC-Schlüssel liegt separat unter
`<paths.dataDir>/preview-log-hmac.key` mit Dateimodus `0600`; er wird weder aus dem
Storage-Schlüssel abgeleitet noch über eine API ausgegeben.

Zeitlich begrenzte Rohdiagnose:

- explizite Bestätigung,
- maximal 15 Minuten,
- nur für ausgewählte Preview,
- Payload-Capture weiterhin größenbegrenzt,
- immer ausgeschlossene Header bleiben ausgeschlossen,
- sichtbarer UI-Indikator,
- Audit-Eintrag bei Start und Ende.

### 13.4 Transport und Backpressure

- Client hält einen Ringpuffer von maximal 2.000 Events pro Preview.
- Persistenz erfolgt in Batches von maximal 100 Events oder alle zwei Sekunden.
- Bei Überlast werden zuerst Debug-/Info-Events verworfen.
- Drop-Zähler werden sichtbar.
- Persistenzfehler blockieren die Preview nicht.
- Diagnose-Batches erhalten ein eigenes, benutzerbezogenes Rate-Limit und teilen nicht
  blind das bisherige globale IP-Budget.

### 13.5 JSONL-Logs

Quelle der Wahrheit für persistierte Diagnose:

```text
<paths.dataDir>/preview-logs/
  2026-07-28.jsonl
  2026-07-29.jsonl
  index.json
```

Regeln:

- Dateien `0600`, Verzeichnis `0700`,
- sieben vollständige Kalendertage,
- UTC und tägliche Rotation,
- abgeschlossene Tage komprimieren,
- maximale Event-, Tages- und Gesamtgröße,
- atomarer `index.json`-Tausch,
- Log-Injection durch JSON-Serialisierung verhindern,
- keine Storage-Snapshot-Nutzlast im Diagnoselog.

### 13.6 UI

Tabs:

1. Console,
2. Fehler,
3. Netzwerk,
4. Routing,
5. Preview-Info.

Jeder Eintrag zeigt Quelle und Vollständigkeit. Technische Details bleiben eingeklappt.
Mobil erscheint die Diagnose als Bottom Sheet oder Vollbild, ohne horizontales
Layoutwachstum.

### 13.7 Verbindliche Design-Grundlage

Vor der Implementierung jeder neuen oder geänderten Preview-, Diagnose-, Storage-,
Quarantäne- oder Browser-Komponente müssen die Skills `design-system-guide` und
`mobile-design` gelesen und angewendet werden.

Dabei gelten folgende Regeln:

- Das bestehende Remote-Workplace-Design hat Vorrang vor den Fallback-Tokens der Skills.
- Die T3-Code-Nightly-Palette und die vorhandenen Tokens in
  `apps/web/src/index.css` bleiben die einzige Farbquelle.
- Neue Komponenten übernehmen Typografie, Radien, Abstände, States, Controls und
  Interaktionsmuster der direkten Nachbarkomponenten.
- Keine Gradients, keine Emojis, keine Glow-Effekte und kein generischer AI-Look.
- Keine neuen hartkodierten Farben in Komponenten.
- DM Sans bleibt die Interface-Schrift; JetBrains Mono bleibt für technische Werte,
  IDs, Ports, Zeitangaben und Logs zuständig.
- Die Oberfläche bleibt minimalistisch und zeigt technische Details erst bei Bedarf.
- Mobile wird zuerst entworfen und auf kleinen Phones, Tablets und Desktop geprüft.
- Touch-Ziele sind mindestens 44 × 44 Pixel groß.
- Diagnose, Konflikte und Storage-Aktionen verwenden mobil Bottom Sheets oder
  Vollbildansichten statt kleiner Desktop-Dialoge.
- Primäre Aktionen liegen auf Touchgeräten in gut erreichbaren Bereichen.
- Gesten besitzen immer eine sichtbare Schaltflächenalternative.
- Safe Areas werden berücksichtigt; primärer Inhalt scrollt nicht horizontal.
- Ladezustände verwenden, wo sinnvoll, ruhige Skeletons statt dauernder Spinner.
- Bestehende Accessibility-, Fokus-, Kontrast- und Reduced-Motion-Regeln bleiben
  erhalten.

Vor Abschluss jeder UI-Phase wird zusätzlich geprüft:

- Designvergleich mit der bestehenden Workbench,
- Smartphone-, Tablet- und Desktop-Layout,
- Tastatur- und Touchbedienung,
- Fokuszustände und Kontrast,
- keine unerlaubten Hex-Farben außerhalb des `@theme`-Blocks und der bereits
  dokumentierten Ausnahmen.

Exit-Gate Phase 4:

- Logstorm-, Serializer-, Redaction-, Rotation- und Rechte-Tests grün.
- Authorization/Cookie-Testwerte erscheinen weder UI-exportiert noch in Dateien.
- Bridge-Ausfall lässt Preview weiterlaufen.
- Neue UI erfüllt `design-system-guide`, `mobile-design` und das bestehende
  Remote-Workplace-Designsystem.
- Rollback: `previews.diagnostics.enabled=false`.

## 14. Phase 5 — localStorage-Snapshot-MVP

### 14.1 Opt-in

- Storage-Snapshot ist pro Preview standardmäßig aus.
- Aktivierung zeigt unterstützte und nicht unterstützte Speicherbereiche.
- Aktivierung warnt ausdrücklich, dass localStorage scriptlesbare Login-Tokens oder
  andere Zugangsdaten enthalten kann.
- Nur vertrauenswürdige lokale Projekt-Previews sind erlaubt.
- Manuelle Portziele ohne Projektbindung erhalten keinen automatischen Snapshot.

### 14.2 Snapshot

- Bridge liest ausschließlich Schlüssel und Stringwerte aus `localStorage`.
- Snapshot wird deterministisch nach Schlüssel sortiert.
- Limits:
  - 1.000 Schlüssel,
  - 256 KiB unkomprimiert,
  - maximal drei historische Revisionen.
- Client berechnet Hash; Server prüft Größe, Revision und Hashformat.
- Die API empfängt kanonisches JSON; Komprimierung und Dekomprimierung passieren
  ausschließlich serverseitig mit festem Ausgabelimit.
- Nach Komprimierung wird die Nutzlast serverseitig wie in Abschnitt 7.3 beschrieben
  authentifiziert verschlüsselt.
- Speicherung ist atomar.
- Die Bridge patcht `Storage.prototype.setItem`, `removeItem` und `clear`, hört auf
  `storage`-Events und plant Änderungen debounced.
- Solange das Dokument sichtbar ist, vergleicht sie zusätzlich höchstens alle fünf
  Sekunden einen lokalen Hash, damit Property-Zuweisungen nicht dauerhaft unbemerkt
  bleiben.
- Bei `visibilitychange` zu `hidden` und `pagehide` wird ein letzter begrenzter
  Vergleich versucht.
- In ausgeblendeten Dokumenten findet kein periodisches Polling statt.

### 14.3 Restore und Konflikte

- Restore ist standardmäßig manuell.
- Automatisches Restore ist nur beim nachweislich leeren, korrekt affinen Slot erlaubt.
- Zwei Clients verwenden `expectedRevision`.
- Konflikt ergibt `409` mit den Aktionen:
  - lokalen Zustand behalten,
  - Serverzustand übernehmen,
  - beide Snapshots vergleichen,
  - historische Revision wiederherstellen.
- Die Vergleichsansicht zeigt zunächst nur Schlüssel, Größen und Hashänderungen.
  Werte werden erst nach einer separaten bewussten Aktion angezeigt.
- Last-Write-Wins ist nicht der stille Standard.
- Restore schreibt die Werte, verifiziert Anzahl/Hash und lädt die Preview erst nach
  Benutzerbestätigung neu.

### 14.4 Ausdrückliche Ausschlüsse

Nicht synchronisiert:

- sessionStorage,
- IndexedDB,
- Cache Storage,
- Service Worker,
- Cookies,
- Blob-/File-/ArrayBuffer-Daten,
- Browser-Credentials.

Nach dem MVP darf ein separater IndexedDB-Export-/Import-Spike geplant werden. Er ist
kein stiller Bestandteil dieses Plans.

Exit-Gate Phase 5:

- Zwei-Client-Konflikttest grün.
- Größenüberschreitung erzeugt Diagnose, nicht Preview-Ausfall.
- Keine Datenübertragung ohne Opt-in.
- Rollback: `previews.storageSync.mode="off"`.

## 15. Phase 6 — Einheitlicher lokaler Browser und Orbit

Betroffene Bereiche:

- `apps/web/src/components/PreviewSlotFrame.tsx`,
- `apps/web/src/components/DevicePreviewFrame.tsx`,
- `apps/web/src/components/browser/BrowserPanel.tsx`,
- `apps/web/src/components/browser/LocalPorts.tsx`,
- `apps/web/src/views/PreviewGroupRoute.tsx`,
- `apps/web/src/components/orbit/OrbitNodeView.tsx`,
- `apps/web/src/stores/orbit.ts`,
- `apps/web/src/lib/previewTargets.ts`,
- `apps/web/src/lib/previewSlotLifecycle.ts`.

### 15.1 Gemeinsame Runtime

- Canvas, Sidebar, Vollbild und lokaler Browser verwenden dieselbe
  `LocalPreviewRuntime`.
- Die Komponente kapselt:
  - Session öffnen/erneuern/schließen,
  - Slot-Affinität,
  - Bridge-Handshake,
  - Diagnose,
  - Device-Frame,
  - Reset-/Quarantänestatus.
- Unmount schließt nur die eigene Lease.
- Zielwechsel löst erst nach erfolgreicher neuer Bindung den alten Zustand.
- Detach/Attach erhält `storageProfileId`, Ziel, Gerät und Diagnosezustand.

### 15.2 Browser-Panel

Lokale Eingaben:

- Port,
- `localhost:<port>`,
- `127.0.0.1:<port>`,
- bekannter Projektservice mit Pfad, Query und Hash.

Verhalten:

- lokale Ziele öffnen `LocalPreviewRuntime`,
- Reload behält Slot und Storage-Profil,
- Back/Forward wird über Bridge-Navigation umgesetzt,
- ohne Bridge zeigt die UI „Navigation innerhalb der Preview nicht beobachtbar“,
- absolute externe URLs bieten:
  - „Im Browser öffnen“,
  - „Server-Chromium verwenden“.
- Der lokale Preview-Gateway proxyt keine externe URL.

### 15.3 Chromium bleibt abgegrenzt

- Bestehende `ChromiumBrowser`-Komponente und Serverrouten bleiben erhalten.
- Preview-UI zeigt Chromium nur bei:
  - externer URL,
  - Cookie-/Profil-Isolationsbedarf,
  - expliziter Benutzerwahl.
- Es gibt in diesem Plan keine Entfernung von:
  - BrowserManager,
  - BrowserDatabase,
  - CDP-Inspector,
  - Profilverzeichnissen,
  - Chromium-Settings.

Eine spätere Entfernung braucht einen eigenen ADR, Nutzungsnachweis, Export-/Archivplan
und separate Benutzerfreigabe.

Exit-Gate Phase 6:

- Alle vier Oberflächen verwenden dieselbe lokale Runtime.
- Externe URLs erreichen den Preview-Gateway nicht.
- Chromium-Profile und letzte URLs bleiben unverändert nutzbar.
- Rollback: bisherige Komponenten bleiben eine Release-Version hinter Feature Flag.

## 16. Testharness und Teststrategie

### 16.1 Lokales Preview-Fixture

Unter `tests/fixtures/preview-apps/` entsteht ein deterministisches Harness:

- SPA mit HMR-Socket,
- MPA mit `/`, `/login`, `/admin` und relativen Assets,
- API mit CORS/Preflight und Redirect,
- WebSocket- und EventSource-Dienst,
- Cookie-App zur Verifikation der dokumentierten Portgrenze,
- Service-Worker-App für Reset/Quarantäne,
- localStorage-App für Snapshot/Konflikt,
- fehlerhafte App für Console, Ressourcenfehler und große Payloads.

Das Harness:

- bindet nur Loopback,
- nutzt reservierte Testports aus einer Testconfig,
- startet und stoppt über Playwright `webServer`,
- führt keinen fremden Projektcode aus,
- hinterlässt keine Prozesse oder Daten.

Für E2E kann der Server per Testsettings öffentliche Slot-URLs als
`http://127.0.0.1:<internalPort>` ausgeben. Produktion bleibt HTTPS/Tailscale. Dafür gibt
es explizite, test-only Settings statt hartkodierter Produktionsannahmen.

### 16.2 Unit-Tests Server

- Migrationen und Rückwärtskompatibilität,
- Identität und Ownership,
- atomare Routing-Revisionen,
- identische versus inkompatible Shared Bindings,
- Slot-Kapazität und Erschöpfung,
- Lease-Rennen und pausierte Clients,
- Affinität, Reset, Quarantäne und Generation,
- HTTP-Methoden und Header,
- Location/Content-Location/Link,
- Set-Cookie-Passthrough und Diagnose,
- HTML-Limit, Charset, parse5 und Doppel-Injektion,
- CSP nur gezielt ändern,
- WebSocket, SSE und Protokollprobe,
- Service-Kandidaten ohne Ausführung von Configcode,
- Diagnose-Redaction, Backpressure, Rotation und Dateirechte,
- Doctor-Logzugriff, Zeitraummaximum, Filter und Capability-Prüfung,
- localStorage-Revision, Hash, Limit und Historie,
- Snapshot-Verschlüsselung, authentifizierte Entschlüsselung, falscher Auth-Tag,
  fehlender Schlüssel und unautorisierter Zugriff.

### 16.3 Unit-Tests Web

- Gerätepräferenz und Slot-Override,
- Orbit-v7-Migration,
- Device-Geometrie und Resize-Canceling,
- Home-Indikator und Clip,
- Bridge-Handshake, Source/Origin/Epoch/Sequence,
- begrenzter Console-Serializer,
- Diagnosefilter und Drop-Zähler,
- LocalPreviewRuntime-Lifecycle,
- Targetwechsel ohne vorzeitige Freigabe,
- Quarantäne- und Cookie-Hinweise,
- localStorage-Opt-in und Konfliktdialog,
- externe URL gelangt nicht in Preview-API.

### 16.4 Automatische E2E-Szenarien

1. SPA laden, HMR verbinden, Reload ohne neuen Storage-Owner.
2. MPA-Routen, Form-Action, Assets, Query und Hash.
3. Frontend, API, WebSocket und SSE als bestätigter Graph.
4. Kandidaten erkennen, bestätigen und Kapazität vorher anzeigen.
5. CORS-Preflight und Redirect zwischen bestätigten Slot-Origins.
6. Nicht bestätigter Port wird nicht verbunden.
7. Zwei identische Sessions dürfen teilen; inkompatible Graphen nicht.
8. Lease-Ablauf verursacht keine stille fremde Neuzuordnung.
9. Service Worker und Storage werden vor fremder Wiederverwendung verifiziert gelöscht.
10. Fehlgeschlagener Reset quarantänisiert den Slot.
11. Cookie-App zeigt fehlende Portisolation und Chromium-Hinweis.
12. Console-/Error-/Gatewayevents zeigen korrekte Quellen.
13. Worker-Request erscheint nicht fälschlich als vollständig erfasst.
14. Redaction entfernt Authorization, Cookie, Tokenquery und Set-Cookie.
15. Logstorm erhöht Drop-Zähler, Preview bleibt bedienbar.
16. localStorage-Snapshot auf Client A; manueller Restore auf Client B.
17. Gleichzeitige Snapshotänderung ergibt Konfliktdialog.
18. IndexedDB/Cache/SW werden nicht als synchronisiert dargestellt.
19. iPhone 13 bleibt 390 × 844; Resize erzeugt keine Kanten.
20. Desktop-Maus/Tastatur und Playwright-Touchkontext.
21. Canvas, Sidebar, Vollbild und Browser nutzen `LocalPreviewRuntime`.
22. Externe URL öffnet echten Browser oder Chromium, nie den Slot-Gateway.
23. Backend-Neustart erhält Affinität, Graph, Orbit und Snapshotmetadaten.
24. Feature-Flag-Rollback auf Gateway v1.

Zwei Benutzer werden über getrennte Browserkontexte und erlaubte Development-Header
simuliert. Tests prüfen, dass Sessions, Snapshots und Repair-Aktionen nicht gegenseitig
zugänglich sind.

### 16.5 Manuelle Infrastrukturabnahme

Nicht Bestandteil des normalen `pnpm test:e2e`:

- echtes Tailscale HTTPS,
- zwei reale Geräte im Tailnet,
- echtes iOS-/Android-Touchverhalten,
- administratives `tailscale serve`,
- eine reale MPA und eine reale Full-Stack-App,
- optionaler Chromium-Cookie-Profiltest.

Das Tailscale-Setup-Skript wird nur bei geänderten Portmappings administrativ
ausgeführt. Der normale Abschluss verlangt kein `sudo`.

### 16.6 Abschlussbefehle

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
curl -s http://127.0.0.1:3010/api/v1/health
bash scripts/preview-doctor.sh --all
```

## 17. Konfiguration und Feature Flags

Neue Werte in `config/workbench.example.json`:

```json
{
  "previews": {
    "gatewayV2Enabled": false,
    "bridgeEnabled": false,
    "diagnosticsEnabled": false,
    "storageSyncMode": "off",
    "slotResetEnabled": false,
    "maxInjectableHtmlBytes": 2097152,
    "diagnosticRetentionDays": 7,
    "diagnosticMaxEventBytes": 65536,
    "diagnosticMaxBatchBytes": 262144,
    "localStorageMaxBytes": 262144,
    "localStorageMaxKeys": 1000
  }
}
```

Regeln:

- Bestehende Portlisten bleiben zentrale Config.
- Settings werden mit Zod validiert.
- Produktion kann Flags phasenweise aktivieren.
- Test-only Origin-Overrides kommen aus expliziten Testsettings/Env-Variablen.
- Keine persönlichen Hosts, Pfade oder Ports werden in Komponenten hartkodiert.

## 18. Rollout und Rollback

### Release A — Fundament

- Contracts, Migrationen und Gateway v2 hinter Flag.
- Nur interne Testnutzer.
- Gateway v1 bleibt verfügbar.

### Release B — Geräte und Diagnose

- Device-Default aktivieren.
- Diagnose zunächst ohne Dateipersistenz, dann mit redigierter Persistenz.
- Fehlerquote, Batchdrops und Proxy-Latenz beobachten.

### Release C — Slot-Reset und Service-Vorschläge

- Reset nur nach bestandenem Realbrowser-Test aktivieren.
- Quarantäne standardmäßig fail-closed.
- Service-Graph weiterhin bestätigungspflichtig.

### Release D — localStorage und einheitliche Runtime

- localStorage opt-in.
- Browser/Canvas/Sidebar/Vollbild auf gemeinsame Runtime.
- Chromium unverändert verfügbar.

Rollback:

- Flags deaktivieren neue Teilfunktionen unabhängig.
- Datenbankmigrationen bleiben abwärtslesbar; Rollback löscht keine Tabellen oder Daten.
- Orbit v7 wird vor Rollout gesichert.
- Browserprofile werden nicht berührt.
- Ein quarantänisierter Slot wird bei Rollback nicht automatisch fremd belegt.

## 19. Dokumentation

Repository-Dokumentation:

- `AGENTS.md`
  - lokale Preview starten,
  - Doctor und sichere Repair-Aktionen,
  - Cookie-/Storage-Grenzen,
  - sicherer Zugriff auf die bis zu sieben Tage Preview-Logs,
  - Pflicht zur Anwendung von `design-system-guide` und `mobile-design` bei
    Preview-UI-Arbeiten.
- Alle künftig innerhalb des Repositories ergänzten, für Preview-Code geltenden
  `AGENTS.md`-Dateien übernehmen dieselben unverzichtbaren Logzugriffs- und
  Designregeln.
- `CLAUDE.md`
  - verweist weiterhin auf `AGENTS.md`,
  - wiederholt nur dann Preview-Regeln, wenn das Werkzeug die zentrale Referenz nicht
    zuverlässig einliest.
- `docs/previews-for-agents.md`
  - Service-Graph,
  - Diagnosequellen,
  - Testharness,
  - Tailscale-Abnahme,
  - vollständige Anleitung für den gefilterten Logzugriff.
- `docs/configuration.md`
  - Flags, Limits und Ports.
- `docs/troubleshooting.md`
  - Quarantäne, Reset, HMR, CORS, Bridge und Chromium-Fallback.
- `README.md`
  - ehrliche Featurebeschreibung ohne vollständigen Browser-/Storage-Sync-Anspruch.

### 19.1 Agentenzugriff auf sieben Tage Preview-Logs

`AGENTS.md` und `docs/previews-for-agents.md` erklären verbindlich:

- Agenten dürfen Preview-Logs lesen, wenn sie für eine aktuelle Diagnose erforderlich
  sind oder der Benutzer den Zugriff ausdrücklich verlangt.
- Ohne Diagnosebedarf werden Logs nicht vorsorglich oder flächendeckend durchsucht.
- Standardzugriff erfolgt über die redigierte API oder den Doctor, nicht direkt über
  die JSONL-Dateien.
- Der Doctor erhält dafür:

```text
bash scripts/preview-doctor.sh --logs \
  --since <1h|24h|7d> \
  [--preview <previewNodeId>] \
  [--severity <debug|info|warn|error>]
```

- Ohne `--since` gilt eine Stunde; maximal erlaubt sind sieben Tage.
- Agenten grenzen Zeitraum, Preview, Slot und Severity so weit wie möglich ein.
- Sie laden oder zitieren nicht pauschal alle sieben Tage.
- Ergebnisse werden zusammengefasst; Secrets, Tokens, Cookies und personenbezogene
  Inhalte werden nicht in Antworten kopiert.
- Logs werden niemals ohne ausdrückliche Benutzerfreigabe an externe Dienste
  übertragen.
- Direkter Dateizugriff auf `<paths.dataDir>/preview-logs/` ist nur erlaubt:
  - wenn die Diagnose-API beziehungsweise der Doctor selbst defekt ist,
  - wenn der Logger untersucht werden muss,
  - oder wenn der Benutzer ihn ausdrücklich verlangt.
- Auch beim direkten Zugriff gelten Redaction, minimale Zeitspanne und lokale
  Verarbeitung.
- Komprimierte ältere Tage und `index.json` werden durch den Doctor transparent
  gelesen; Agenten müssen die Rotation nicht selbst umgehen.
- Die Dokumentation enthält Beispiele für:
  - letzte Fehler einer Preview,
  - Routingfehler eines Slots,
  - HMR-/WebSocket-Abbrüche,
  - Reset-/Quarantäneereignisse,
  - Log-Drops und Retentionprobleme.
- Jede Agentenanleitung erklärt, dass Logs Best-Effort-Diagnose sind und nicht die
  Vollständigkeit von CDP/Chrome DevTools besitzen.

Globale Dateien unter `~/.codex`, `~/.claude` oder `~/.config/opencode` werden in
diesem Vorhaben nicht geändert. Eine globale Synchronisierung wäre ein separates,
explizit bestätigtes Wartungsvorhaben.

## 20. Risiken und verbindliche Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Externe Website blockiert iframe | Nicht proxyen; Client-Browser oder Chromium |
| Cookies teilen sich Host über Ports | Klarer Hinweis; Chromium für Isolation |
| Alter Service Worker kontrolliert neu belegten Slot | Affinität, Reset-Verifikation, sonst Quarantäne |
| Reset kann nicht verifiziert werden | Fail-closed; keine fremde Wiederverwendung |
| Shared Slot hat mehrere Routingkontexte | Teilen nur bei identischem Binding-Fingerprint |
| Slotkapazität reicht nicht | Vorabberechnung; keine Teilaktivierung |
| Bridge wird durch CSP blockiert | Gezielte lokale CSP-Anpassung oder Diagnose ohne Bridge |
| HTML ist groß, streamend oder nicht UTF-8 | Unverändert proxyen; Bridge als nicht verfügbar markieren |
| Worker-/SW-Netzwerk fehlt in Clientdiagnose | Quellen und Vollständigkeit sichtbar machen |
| Console-Objekt ist zyklisch oder bösartig | Begrenzter Serializer ohne `toJSON` |
| Logs enthalten Secrets | Immer-Redaction, Body aus, kurzlebiges Opt-in |
| Logstorm überlastet API | Batch, separates Limit, Prioritätsdrops und Zähler |
| Snapshot überschreibt parallelen Zustand | Expected Revision und sichtbarer Konflikt |
| localStorage-Snapshot enthält Login-Token | Explizites Opt-in, Warnung, AES-GCM und strikte Ownership |
| Snapshot-Schlüssel fehlt oder ist falsch | Snapshot `unavailable`; niemals still überschreiben |
| Storage-MVP wird als Login-Sync missverstanden | UI-Matrix und explizite Ausschlüsse |
| Agent repariert zu aggressiv | Nur validierte Graph-/Probe-Aktionen |
| Migration verliert Browserprofile | Keine Löschung oder automatische Migration |
| Tailscale fehlt | Klarer Infrastrukturstatus; lokale HTTP-Testorigin |

## 21. Definition of Done

Die Umsetzung ist abgeschlossen, wenn:

- lokale Previews standardmäßig über iframe-Slots laufen,
- externe URLs niemals durch den lokalen Preview-Gateway geleitet werden,
- Server-Chromium und bestehende Browserprofile funktionsfähig und unverändert bleiben,
- Preview-APIs Benutzeridentität und Ownership erzwingen,
- Routingänderungen atomar als Revision veröffentlicht werden,
- Shared Slots nur mit identischem Binding-Fingerprint möglich sind,
- Slot-Affinitäten projektübergreifende Storage-/Service-Worker-Vermischung verhindern,
- fehlgeschlagene Resets einen Slot in Quarantäne setzen,
- Cookie-Portgrenzen im UI sichtbar sind,
- Gerätepräferenz, Slot-Override und iPhone-13-Fallback korrekt greifen,
- keine weißen Kanten/Ecken und kein schwarzer Home-Indikator auftreten,
- SPA, MPA, HMR, WebSocket, SSE und bestätigte Full-Stack-Graphen funktionieren,
- Service-Erkennung nur Vorschläge erzeugt,
- Diagnosequellen und Vollständigkeit transparent sind,
- Secrets zuverlässig redigiert und Logstorms begrenzt werden,
- localStorage-Snapshots nur opt-in, größenbegrenzt und konfliktbewusst arbeiten,
- localStorage-Snapshots verschlüsselt gespeichert werden und bei Schlüsselproblemen
  niemals still überschrieben oder unverschlüsselt zurückgegeben werden,
- IndexedDB, Cache, Service Worker, sessionStorage und Cookies nicht als synchronisiert
  dargestellt werden,
- Canvas, Sidebar, Vollbild und lokaler Browser dieselbe Runtime verwenden,
- automatische Testharness-Szenarien grün sind,
- die manuelle Tailscale-/Geräteabnahme dokumentiert wurde,
- `AGENTS.md` und `docs/previews-for-agents.md` den sicheren, gefilterten Zugriff auf
  maximal sieben Tage Preview-Logs erklären,
- alle neue Preview-UI nach `design-system-guide`, `mobile-design` und dem bestehenden
  Remote-Workplace-Designsystem umgesetzt wurde,
- Feature-Flag-Rollback geprüft ist,
- `pnpm typecheck`, `pnpm lint`, `pnpm test` und `pnpm test:e2e` grün sind.

## 22. Implementierungsreihenfolge und Bestätigungspunkt

Die Reihenfolge ist verbindlich:

1. Phase-0-Spikes,
2. Contracts und Migrationen,
3. atomarer Gateway und Slot-Affinität,
4. Geräte/Skalierung,
5. Service-Vorschläge,
6. Diagnose,
7. localStorage-MVP,
8. einheitliche Runtime,
9. Rollout und Dokumentation.

Nach Phase 0 wird einmal gegen die Go-/No-Go-Kriterien geprüft. Erst danach beginnen
produktive Migrationen. Eine spätere Chromium-Entfernung oder IndexedDB-Synchronisierung
benötigt jeweils einen neuen, separat bestätigten Plan.

## 23. Abdeckung des Architekturreviews

Alle zuvor identifizierten Schwächen sind einer verbindlichen Planstelle zugeordnet:

| Review-Finding | Behandlung im Plan |
|---|---|
| iframe kann keinen vollständigen externen Browser ersetzen | Scope in Abschnitt 1–3; externer Browser/Chromium in Phase 6 |
| Cookie-Isolation funktioniert nicht über Ports | Storage-Matrix, Set-Cookie-Regeln, sichtbarer Chromium-Hinweis |
| Generischer Storage-Vollsync ist nicht realistisch | MVP auf localStorage begrenzt; übrige Speicher ausdrücklich ausgeschlossen |
| Slot-Rebinding vermischt Storage und Service Worker | Affinität, Generation, Reset-Spike und fail-closed Quarantäne |
| Preview-APIs besitzen keine Ownership | Identitätsmodell, Same-Origin-Regeln, benutzergebundene Tabellen und Endpunkte |
| Agentenzugriff kollidiert mit Browser-CSRF-Schutz | Loopback-only Capability mit strikt begrenzten Aktionen |
| Shared Slots haben mehrdeutigen Sessionkontext | Identischer Binding-Fingerprint und atomarer Routing-Snapshot |
| Mehrport-Projekte können Slots erschöpfen | Kapazitätsvorschau und keine Teilaktivierung |
| Client-Bridge sieht nicht das vollständige Netzwerk | Quellen- und Vollständigkeitskennzeichnung |
| Rohlogs können Secrets speichern | Immer-Redaction, Body standardmäßig aus, begrenzte Capture-Sitzung |
| Diagnose kann API und UI überlasten | Batches, getrenntes Limit, Ringpuffer, Prioritätsdrops und Drop-Zähler |
| Gerätepräferenz und Slot-Default widersprachen sich | Orbit-v7-Migration und eindeutige Vererbungsregeln |
| HTML-Regex, Vollpufferung und CSP-Entfernung sind riskant | parse5-Spike, Größen-/Charsetgrenzen und gezielte CSP-Anpassung |
| API-, Tabellen- und Logquellen waren unklar | konkrete Schemas, Endpunkte, Tabellen und JSONL als einzige Persistenz |
| Service-Graph-Reparatur war zu aggressiv | Vorschläge zuerst; keine automatische Quellcode-/CORS-Änderung |
| E2E-Szenarien hatten kein ausführbares Harness | deterministische Loopback-Fixtures und getrennte manuelle Infrastrukturtests |
| Tailscale-/sudo-Prüfung war nicht CI-tauglich | manueller Abnahmeblock; normaler Abschluss ohne sudo |
| Migration konnte Browserprofile gefährden | Chromium bleibt; Profile werden weder gelöscht noch migriert |
| Globale Agent-Dateien waren Scope Creep | ausschließlich Repository-Dokumentation |
| Rollout und Rückweg fehlten | unabhängige Feature Flags, Release-Stufen und datenverlustfreier Rollback |
| Agenten brauchten einen kontrollierten Zugriff auf sieben Tage Logs | AGENTS-Regeln, Doctor-Filter, Redaction und klare Zugriffsauslöser |
| Designvorgaben waren nicht als Umsetzungsgrundlage verankert | Pflicht für `design-system-guide`, `mobile-design` und bestehende T3-Nightly-Tokens |
