# Hermes Agent Integration in Remote Workplace — Umsetzungsplan (Fassung 2)

> **Fassung 2 vom 2026-08-01.** Fassung 1 war ein Anforderungsdokument mit vermuteten
> technischen Gegebenheiten. Diese Fassung ersetzt die Vermutungen durch am Server
> verifizierte Befunde und benennt konkrete Dateien, Schemata, Units und Befehle.
> Abschnitt 0 listet auf, was sich fachlich geändert hat und warum.
> Die Produktanforderungen aus Fassung 1 bleiben unverändert gültig.

---

## Inhalt

- [0. Was sich gegenüber Fassung 1 geändert hat](#0-was-sich-gegenüber-fassung-1-geändert-hat)
- [1. Auftrag und Arbeitsmodus](#1-auftrag-und-arbeitsmodus)
- [2. Verifizierter Ist-Zustand](#2-verifizierter-ist-zustand)
- [3. Technische Leitentscheidungen](#3-technische-leitentscheidungen)
- [4. Verbindliche Produktentscheidungen](#4-verbindliche-produktentscheidungen)
- [5. Phasenplan](#5-phasenplan)
- [6. Tests](#6-tests)
- [7. Verifikation auf dem Server](#7-verifikation-auf-dem-server)
- [8. Dokumentation, Changelog, Version](#8-dokumentation-changelog-version)
- [9. Rollback](#9-rollback)
- [10. Akzeptanzkriterien und Definition of Done](#10-akzeptanzkriterien-und-definition-of-done)
- [11. Risiken und offene Verifikationspunkte](#11-risiken-und-offene-verifikationspunkte)

---

## 0. Was sich gegenüber Fassung 1 geändert hat

Jeder Punkt ist am laufenden System oder im Quellcode belegt. Die Quelle steht dabei.

| # | Annahme in Fassung 1 | Verifizierter Befund | Konsequenz für den Plan |
|---|---|---|---|
| 1 | Systemweite systemd-Units, Root-Helper, exakte `sudoers`-Regeln für die Dienststeuerung | Alle Workbench-Dienste laufen als **User-Units** (`workbench.service`, `t3-code.service`, `hermes-gateway.service`). `hermes-gateway.service` existiert bereits und läuft seit Wochen als User-Unit. | Kein Root-Helper, keine `sudoers`-Regel, keine systemweite Unit. Dienststeuerung ausschließlich über `systemctl --user`. Siehe [Phase 5](#phase-5-systemdienste). |
| 2 | „kein `sudo` verfügbar" (`AGENTS.md`) | `sudo -n -l` meldet `(ALL) NOPASSWD: ALL`. Passwortloses Root ist faktisch vorhanden. | Der Befund ändert die Entscheidung **nicht** — er macht sie zu einer bewussten. Die Integration nutzt kein `sudo`. Der Widerspruch in `AGENTS.md` wird in [Phase 15](#phase-15-dokumentation) korrigiert. |
| 3 | Hermes-Checkout in ein Laufzeitverzeichnis des Remote-Workplace-Repos verschieben | Der Checkout liegt in `~/.hermes/hermes-agent` und ist ein **Git-Repo, das `hermes update` per `git pull` aktualisiert**. `hermes version` meldet `Project: /home/user/.hermes/hermes-agent`. Gateway-Unit, `hermes doctor` und die venv verweisen darauf. | Der Checkout wird **nicht verschoben**. Ein Umzug bräche `hermes update`, `hermes doctor` und die Gateway-Unit. Siehe [Phase 3](#phase-3-installations--und-datenstrategie). |
| 4 | Proxy setzt `Host` auf den Workbench-Host (wie der T3-Proxy) | `hermes_cli/web_server.py:206` `host_header_middleware` weist **jede** Anfrage mit einem `Host`, der nicht der Bind-Adresse entspricht, mit `400` ab (DNS-Rebinding-Schutz, GHSA-ppp5-vxwm-4cf7). | Der Hermes-Proxy **muss** `Host: 127.0.0.1:<port>` setzen. Ein Kopieren des T3-Proxy-Headerverhaltens macht das Dashboard komplett unerreichbar. Siehe [Phase 7](#phase-7-dashboard-proxy). |
| 5 | „Keine zusätzliche Hermes-Anmeldung" | Das Dashboard erzeugt pro Prozessstart ein **ephemeres Session-Token** (`web_server.py:86`), verlangt es via `X-Hermes-Session-Token` auf allen `/api/*` außer sechs öffentlichen Pfaden (`web_server.py:113`) und injiziert es in `index.html`. | Für den Benutzer bleibt es unsichtbar (die SPA bekommt es aus dem HTML). Der **Server-seitige Client** von Remote Workplace muss es aus `GET /` scrapen, cachen und bei `401` neu holen. Siehe [Phase 6](#phase-6-hermes-backend-adapter). |
| 6 | `X-Forwarded-Prefix` „wird offiziell unterstützt" (unbelegt) | Bestätigt: `_normalise_prefix` (`web_server.py:3628`), Rewrite von `index.html`, CSS-`url()`, `__HERMES_BASE_PATH__` für die SPA. Präfix max. 64 Zeichen, kein `..`, kein `//`. | `/hermes` ist gültig und funktioniert ohne HTML-Hacks. Die Bridge zum Speichern der letzten Verwaltungsseite bleibt trotzdem nötig (die SPA meldet ihre Route nicht nach außen). |
| 7 | Chat über „`hermes serve` / TUI-Gateway-WebSocket" | Es gibt kein `hermes serve`. Der Dashboard-Chat (`/api/pty`) ist eine **PTY-Brücke auf die TUI** und nur mit `--tui` aktiv — genau das, was der Chat laut Anforderung nicht sein darf. Stattdessen existiert `hermes acp`: ein vollständiger **Agent-Client-Protocol-Server** (`acp_adapter/`) mit `session/new`, `session/load`, `session/prompt`, `session/cancel`, `fork_session`, `list_sessions`, Streaming-Updates, Tool-Call-Updates, `session/request_permission` und Modellwahl. Sessions werden in dieselbe `~/.hermes/state.db` geschrieben wie Telegram und Cron. | **ACP ist der Chat-Transport.** Der Dashboard-PTY-Chat bleibt deaktiviert. Siehe [Phase 6.3](#63-acp-manager--der-chat-transport). |
| 8 | Orbit: neue Knotentypen per `baseNodeSchema.extend({ type: z.literal(...) })` | `orbitNodeSchema` (`packages/contracts/src/index.ts:1148`) ist ein **flaches** Objekt mit `superRefine`, keine diskriminierte Union. Ein Werkzeugknoten ist `type: "tool"` + `toolType: PanelType` und rendert direkt `<ToolPanel>` (`OrbitNodeView.tsx:177`). | Der Hermes-**Chat**-Knoten braucht **keinen** neuen Knotentyp — er entsteht automatisch aus `panelTypeSchema += "hermes"`. Nur vier neue Typen sind nötig: `hermesStatus`, `hermesTasks`, `hermesCron`, `hermesResults`. Siehe [Phase 11](#phase-11-orbit-integration). |
| 9 | Panel-Metadaten als verschachteltes `hermesPanelStateSchema` | `panelSchema` ist flach; `browserUrl` ist als **optionales** Feld angehängt, damit gespeicherte Arbeitsflächen kompatibel bleiben. `apps/web/src/stores/workspace.ts:159` hält eine **zweite, eigene Kopie** des Schemas für die v2-Migration. | Flache optionale Felder statt Unterobjekt. **Beide** Schemata anpassen. Siehe [Phase 4](#phase-4-gemeinsame-contracts). |
| 10 | Benachrichtigungssystem | Das generische System ist umgesetzt. Es speichert Einträge dauerhaft und unterstützt Web-Push. | Aktuellen Stand siehe [Phase 12](#phase-12-benachrichtigungen). |
| 11 | „intelligenter Approval-Modus" konfigurieren | `approvals.mode` kennt laut Dashboard-Schema nur `ask`, `yolo`, `deny` (aktuell steht `manual` als Altwert in `~/.hermes/config.yaml`). Es gibt **keinen** intelligenten Modus. Normale Dateiänderungen lösen ohnehin keine Freigabe aus — nur Treffer der `DANGEROUS_PATTERNS` (`tools/approval.py`). | Zielzustand: `approvals.mode: ask`. **Zusätzlicher, in Fassung 1 fehlender Befund:** `command_allowlist` enthält aktuell dauerhaft freigegebene Muster für *rekursives Löschen*, *Löschen im Root-Pfad*, *`sudo` mit Privilegien-Flag* und *Überschreiben von Projekt-Env/Config*. Das widerspricht den Anforderungen direkt. Siehe [Phase 13](#phase-13-sicherheit-und-approvals). |
| 12 | Dashboard-Theme ggf. per CSS-Injektion | Offizielles Theme-System vorhanden: YAML-Dateien in `$HERMES_HOME/dashboard-themes/*.yaml`, gelesen von `/api/dashboard/themes`, mit `palette`, `typography`, `layout`, `colorOverrides` (19 erlaubte Schlüssel), `components` (9 Buckets), `assets` und `customCSS` (≤ 32 KiB). | Theme als YAML **außerhalb** des Checkouts → übersteht `hermes update` unbeschadet. Keine CSS-Injektion. Siehe [Phase 14](#phase-14-theme-und-icon). |
| 13 | „Offizielles Hermes-Icon suchen" (ohne Fundort) | Gefunden: `~/.hermes/hermes-agent/acp_registry/icon.svg` — Caduceus, `viewBox="0 0 16 16"`, bereits vollständig auf `currentColor`. Lizenz: MIT, © 2025 Nous Research. | Konkretes Asset, konkrete Lizenzlage. Anpassung an das Icon-System der Workbench (das `var(--icon-*)`-Token statt `currentColor` verwendet). Siehe [Phase 14](#phase-14-theme-und-icon). |
| 14 | Dashboard „startet einfach" | `WEB_DIST = hermes_cli/web_dist` existiert **nicht**. `hermes dashboard` baut die SPA bei jedem Start per `npm run build`, sofern nicht `--skip-build`. Ohne gebautes `web_dist` liefert das Dashboard nur `{"error": "Frontend not built"}`. | Ein **Build-Schritt** gehört in Installation *und* Update-Ablauf; die Unit läuft mit `--skip-build`. In Fassung 1 fehlte das komplett. Siehe [Phase 3](#phase-3-installations--und-datenstrategie) und [Phase 8](#phase-8-automatische-updates). |
| 15 | Update täglich „04:15 Europe/Berlin" | Systemzeitzone ist `Etc/UTC`. systemd ist 255 — Zeitzonen im Kalender-Ausdruck werden ab v252 unterstützt. | `OnCalendar=*-*-* 04:15:00 Europe/Berlin` **muss** explizit gesetzt werden, sonst läuft der Timer um 06:15 (Sommer) bzw. 05:15 (Winter) Ortszeit. |
| 16 | Sicherheit des Proxys | `apps/server/src/security/workbench-identity.ts:10` schützt `/api/`, `/editor`, `/t3`, `/assets/`, `/`, `/ws` … — `/hermes` ist **nicht** dabei. | Ohne Ergänzung wäre `/hermes` (inkl. API-Schlüssel-Verwaltung) **ohne Identitätsprüfung** erreichbar. Kritisch. Siehe [Phase 7](#phase-7-dashboard-proxy). |
| 17 | „Route `/hermes-agent`" vs. Proxy-Präfix `/hermes` | Das Frontend wird unter dem Basispfad `/workbench/` ausgeliefert (`app.ts:481`), SPA-Routen sind also real `/workbench/hermes-agent`. Der Proxy-Präfix `/hermes` liegt auf der Server-Wurzel. | Kein Konflikt, aber der Unterschied muss im Code und in der Doku klar sein. |
| 18 | Rate-Limit / Helmet für den Proxy | Der T3-Proxy registriert jede Route mit `config: { rateLimit: false }, helmet: false`. | Der Hermes-Proxy braucht dasselbe, sonst reißen Streaming und Asset-Ladungen das API-Limit (1200/min, gemeinsames Budget hinter Tailscale). |

**Weitere Präzisierungen ohne Widerspruch zu Fassung 1**

- Das Dashboard bietet bereits eine reiche REST-API (`/api/status`, `/api/sessions`, `/api/sessions/{id}/messages`, `/api/cron/jobs`, `/api/logs`, `/api/gateway/restart`, `/api/hermes/update`, `/api/actions/{name}/status`, `/api/analytics/usage`). Die Orbit-Knoten „Status", „Aktive Aufgaben", „Automatisierungen" und „Ergebnisse" brauchen deshalb **keine** CLI-Aufrufe.
- `hermes backup` erzeugt ein vollständiges ZIP von `HERMES_HOME`, `hermes import` spielt es zurück, `hermes update --backup` erzwingt ein Pre-Update-Backup. Das deckt die Snapshot- und Backup-Anforderungen offiziell ab.
- `hermes dashboard --status` ist unzuverlässig: der Aufruf zählt sich selbst als laufendes Dashboard mit. Für Statusabfragen ist `systemctl --user is-active` plus HTTP-Health die belastbare Quelle.

---

## 1. Auftrag und Arbeitsmodus

### 1.1 Auftrag

Implementiere die vollständige Hermes-Agent-Integration in `Remote_Workplace` in einem
durchgehenden Arbeitslauf: Contracts, Backend, Frontend, Workbench, Orbit, Systemdienste,
Updates, Benachrichtigungen, Tests und Dokumentation.

Arbeite nicht nur einen Plan aus. Führe die Implementierung durch, führe alle Prüfungen aus,
behebe auftretende Fehler und liefere am Ende einen verifizierten, produktionsreifen Stand.

Stelle keine Rückfragen. Die Produktentscheidungen stehen in [Abschnitt 4](#4-verbindliche-produktentscheidungen).
Weicht der Ist-Zustand von diesem Dokument ab, untersuche ihn, wähle die einfachste robuste
Lösung, die alle Anforderungen erfüllt, und **dokumentiere die Abweichung im
Implementierungsbericht**. Stoppe nicht nach einem Teilbereich.

### 1.2 Reihenfolge

Die Phasen in [Abschnitt 5](#5-phasenplan) bauen aufeinander auf und sind so geschnitten, dass
nach jeder Phase `pnpm typecheck` grün ist. Die Reihenfolge ist verbindlich; Phasen 9–12 dürfen
untereinander getauscht werden.

Nach Änderungen an `packages/contracts` **zuerst** `pnpm --filter @workbench/contracts build`,
sonst sehen Server und Web die neuen Typen nicht.

### 1.3 Verbindliche Arbeitsregeln

1. Keine halbfertigen Platzhalter, keine reine Mock-UI ohne echten Hermes-Transport.
2. Keine zweite Hermes-Datenhaltung. Web, Telegram und Cron teilen sich `~/.hermes/state.db`.
3. Keine neue Telegram-Konfiguration, solange die bestehende übernommen werden kann.
4. Kein `sudo`, kein Root-Helper, keine systemweite Unit — auch wenn `sudo` verfügbar wäre.
5. Keine direkten Frontend-Importe aus `~/.hermes/hermes-agent`. Der Checkout wird von
   `hermes update` ohne Rücksicht auf Remote Workplace verändert.
6. Keine globalen Proxy-Routen für Hermes. Alles bleibt unter `/hermes`.
7. Keine absoluten privaten Pfade im Repository. Pfade kommen aus `config/workbench.local.json`
   oder werden erkannt.
8. Keine stillen Fehler. Jeder Fehlerzustand hat eine sichtbare nächste Aktion.
9. Keine bestehende Workbench-Funktion darf brechen (T3, Terminal, Code-Server, Codex,
   OpenCode, Browser, Previews, Dateimanager, Orbit, Tech TLDRs).
10. Deutsch für Commits, Kommentare, UI-Texte. Design nach dem bestehenden dunklen System.
11. Verwende die Skills für Design, Mobile, Konfiguration, Sicherheit und Testing.
12. **Jede sichtbare Änderung wird im echten Browser über den headless `playwright`-MCP
    verifiziert.** Scheitern die T3-eigenen `preview_*`-Werkzeuge mit
    `PreviewAutomationNoAvailableHostError`, ist das der Wechselgrund auf den
    `playwright`-MCP, kein Grund, die Prüfung auszulassen. Details in
    [6.4](#64-browser-verifikation-mit-dem-playwright-mcp--verbindlich).

---

## 2. Verifizierter Ist-Zustand

### 2.1 Remote Workplace

**Aufbau.** pnpm-Monorepo, Node ≥ 22, TypeScript.
`apps/server` (Fastify, `127.0.0.1:3010`, API unter `/api/v1`),
`apps/web` (React/Vite, ausgeliefert unter `/workbench/`),
`packages/contracts` (geteilte Zod-Schemas). Version aktuell `0.36.0`.

**Dienste (alle User-Units).**

| Unit | Zweck | Steuerung |
|---|---|---|
| `workbench.service` | Server auf 3010 | `systemctl --user` |
| `t3-code.service` | T3 Code auf 3773, eingebettet über `/t3` | `systemctl --user` |
| `code-server.service` | VS Code im Browser | `systemctl --user` (aktuell `bad`) |
| `hermes-gateway.service` | **existiert bereits**, Telegram-Gateway | `systemctl --user` |

Unit-Templates: `deploy/systemd/units/`, gerendert von `deploy/systemd/render-units.mjs`
(füllt `__TOKEN__`-Platzhalter aus `config/workbench.local.json`) nach
`deploy/systemd/generated/`, installiert von `deploy/systemd/install.sh` nach
`~/.config/systemd/user/`.

**Für die Integration relevante Dateien.**

| Bereich | Datei | Anmerkung |
|---|---|---|
| Navigation | `apps/web/src/routes/navigation.ts` | `toolRouteItems`, erster Eintrag ist T3 Code |
| Routen-IDs | `apps/web/src/routes/routeDefinitions.ts` | `id`, `path`, `requiresProject` |
| Routing | `apps/web/src/App.tsx` | `lazy` + `DeferredRoute` je Route |
| Lazy-Loader | `apps/web/src/lib/routeModules.ts` | `routeLoaders` + `pathLoaders` für Prefetch |
| Route-Persistenz | `apps/web/src/components/PersistentOutlet.tsx` | hält besuchte Routen gemountet |
| Panel-Rendering | `apps/web/src/components/ToolPanel.tsx` | `panelTitles`, `resolvePanel`, Aktionsleiste |
| Standalone-Route | `apps/web/src/views/ToolRoute.tsx` | Muster für eine Werkzeugseite |
| Workspace-Store | `apps/web/src/stores/workspace.ts` | Zustand + **eigene Schemakopie** (Z. 159 ff.) |
| Orbit-Store | `apps/web/src/stores/orbit.ts` | `addNode` (Z. 441) |
| Orbit-Knoten | `apps/web/src/components/orbit/OrbitNodeView.tsx` | `ToolNode` (Z. 177) rendert `ToolPanel` |
| Orbit-Palette | `apps/web/src/views/OrbitWorkbench.tsx` | `commandPayloads` (Z. 236), `minimapNodeColor` (Z. 262) |
| Icons | `apps/web/src/components/icons/WorkbenchIcons.tsx` | `IconSvg`, `viewBox="0 0 24 24"`, `var(--icon-*)` |
| App-Shell | `apps/web/src/components/AppShell.tsx` | Topbar + `PersistentOutlet` (Z. 211) |
| Contracts | `packages/contracts/src/index.ts` | `panelTypeSchema` (1000), `orbitNodeSchema` (1148), `ORBIT_DOCUMENT_VERSION = 7` (1242), `WORKBENCH_LIMITS` (915) |
| Server-Bootstrap | `apps/server/src/app.ts` | Helmet/CSP (208), Rate-Limit (222), WS (246), Hooks (321), Proxy-Registrierung (474) |
| Settings | `apps/server/src/config/settings.ts` | Zod über `process.env`, Defaults aus `workbench.local.json` |
| Zentrale Config | `apps/server/src/config/workbench-config.ts` | `workbenchConfigSchema`, `persistT3Channel` als Schreibmuster |
| T3-Proxy | `apps/server/src/services/t3Proxy.ts` | Referenzmuster HTTP + WebSocket |
| Terminal-WS | `apps/server/src/terminal/routes.ts` | Referenzmuster für authentifizierte WS-Routen |
| Identität | `apps/server/src/security/workbench-identity.ts` | `protectedPrefixes`, `requireMutationOrigin` |
| Same-Origin | `apps/server/src/security/same-origin.ts` | `isSameOriginRequest` |
| WS-Queue | `apps/server/src/utils/websocketSendQueue.ts` | Backpressure für WS-Senden |
| Neustart | `apps/server/src/system/restart.ts`, `scripts/lib-restart.sh` | Build + Dienst-Neustart |
| E2E | `tests/e2e/`, `tests/e2e/helpers/environment.ts` | `hasPrivateWorkbench`, `apiIdentityHeaders` |

**Sicherheitsmodell.** Jede geschützte Anfrage braucht den Header `tailscale-user-login` mit
einem Wert aus `tailscale.allowedUsers`. Mutierende Anfragen brauchen zusätzlich Same-Origin
(`requireMutationOrigin`). WebSockets prüfen zusätzlich `isSameOriginRequest`.
CSP erlaubt `frameSrc: ['self', …]` — ein Iframe auf `/hermes/` ist damit zulässig.

**Benachrichtigungen.** Hermes-Ergebnisse und Update-Fehler werden als dauerhafte
Einträge erfasst. Push kann in den Benachrichtigungseinstellungen pro Quelle aktiviert werden.

### 2.2 Hermes Agent

```
Version    Hermes Agent v0.14.0 (2026.5.16), Python 3.11.15
CLI        /home/user/.local/bin/hermes
Checkout   /home/user/.hermes/hermes-agent   (Git-Repo, Ziel von `hermes update`)
venv       /home/user/.hermes/hermes-agent/venv
HERMES_HOME /home/user/.hermes
Gateway    hermes-gateway.service (User-Unit, enabled, active)
           ExecStart = venv/bin/python -m hermes_cli.main gateway run --replace
Dashboard  läuft nicht; Port 9119 frei; hermes_cli/web_dist fehlt (SPA ungebaut)
```

**`HERMES_HOME`-Inhalt (bleibt unangetastet).**
`config.yaml`, `auth.json`, `state.db` (Sessions, WAL), `kanban.db`, `sessions/`, `memories/`,
`skills/`, `cron/`, `hooks/`, `pairing/`, `logs/`, `bin/`, `sandboxes/`, `channel_directory.json`,
`gateway_state.json`, `gateway.pid`, `SOUL.md`.

**Relevante Konfiguration (`~/.hermes/config.yaml`).**

```yaml
approvals:
  mode: manual            # Altwert; Dashboard-Schema kennt ask | yolo | deny
  timeout: 60             # Sekunden bis eine Freigabeanfrage verfällt
  cron_mode: deny
  mcp_reload_confirm: true
  destructive_slash_confirm: false
command_allowlist:        # DAUERHAFT freigegebene gefährliche Muster — siehe Phase 13
  - script execution via -e/-c flag
  - sudo with privilege flag (stdin/askpass/shell/list)
  - delete in root path
  - recursive delete
  - overwrite project env/config via redirection
updates:
  pre_update_backup: false
  backup_keep: 5
dashboard:
  theme: default
  show_token_analytics: false
```

**Dashboard (`hermes_cli/web_server.py`, FastAPI + uvicorn).**

```
hermes dashboard [--port 9119] [--host 127.0.0.1] [--no-open] [--skip-build]
                 [--tui] [--insecure] [--stop] [--status]
```

- Bindet auf Loopback; nicht-lokale Bindung verlangt `--insecure` (nicht verwenden).
- `host_header_middleware`: `Host` muss zur Bind-Adresse passen, sonst `400`.
- `auth_middleware`: alle `/api/*` außer `/api/status`, `/api/config/defaults`,
  `/api/config/schema`, `/api/model/info`, `/api/dashboard/themes`,
  `/api/dashboard/plugins`, `/api/dashboard/plugins/rescan` brauchen
  `X-Hermes-Session-Token` (oder `Authorization: Bearer <token>`).
- CORS nur für `http(s)://(localhost|127.0.0.1)(:port)?`.
- SPA-Auslieferung mit `X-Forwarded-Prefix`-Rewrite für `index.html`, `/assets/*.css`,
  `/fonts/`, `/ds-assets/`, `/favicon.ico`; SPA liest `window.__HERMES_BASE_PATH__`.
- WebSockets: `/api/ws` (Gateway-Events, Token als Query-Parameter),
  `/api/pty`, `/api/pub`, `/api/events` (nur mit `--tui`, sonst Close-Code 4403).
  Alle prüfen zusätzlich, dass der Peer Loopback ist (`uvicorn` läuft mit
  `proxy_headers=False`, sieht also unseren Proxy als echten Peer — das passt).

**REST-Endpunkte des Dashboards, die wir nutzen.**

| Endpunkt | Verwendung in Remote Workplace |
|---|---|
| `GET /api/status` | Statusknoten, Diagnose, Health (öffentlich, kein Token) |
| `GET /api/sessions?limit&offset` | Sessionliste, Aufgaben, Ergebnisse |
| `GET /api/sessions/search?q` | Suche in der Sessionliste |
| `GET /api/sessions/{id}` / `/messages` | Transkript, Ergebnisvorschau |
| `DELETE /api/sessions/{id}` | Session löschen (nur nach Bestätigung) |
| `GET /api/cron/jobs`, `.../{id}` | Automatisierungen-Knoten |
| `POST /api/cron/jobs/{id}/{pause,resume,trigger}` | optionale Aktionen im Knoten |
| `GET /api/model/info`, `/api/model/options` | Anbieter und Modell im Header (öffentlich) |
| `POST /api/model/set` | Modellwechsel aus dem Drei-Punkte-Menü |
| `GET /api/logs` | Diagnose, Logansicht |
| `POST /api/gateway/restart` | Gateway-Neustart (Alternative zu `systemctl --user`) |
| `POST /api/hermes/update`, `GET /api/actions/{name}/status` | Update aus der UI |
| `GET /api/dashboard/themes`, `PUT /api/dashboard/theme` | Theme setzen |

**ACP (`hermes acp`, `acp_adapter/`).** JSON-RPC über stdio. Ein Prozess bedient viele Sessions
(`SessionManager`), persistiert nach `~/.hermes/state.db` (`session.py:3`: „Sessions are
persisted to the shared SessionDB … so they survive process restarts and are searchable").

Verfügbare Methoden (`acp_adapter/server.py`): `initialize`, `authenticate`, `new_session`,
`load_session`, `resume_session`, `fork_session`, `list_sessions`, `prompt`, `cancel`,
`set_session_model`, `set_session_mode`, `set_config_option`.
Ausgehend: Streaming-Chunks (`agent_message_chunk`, `agent_thought_chunk`), `tool_call` /
`tool_call_update`, `available_commands_update` (Slash-Befehle), `UsageUpdate`,
Session-Info-Updates, Titelaktualisierung.
Freigaben laufen über `session/request_permission` mit den Optionen `allow_once`,
`allow_session`, `allow_always`, `deny` (`acp_adapter/permissions.py:21`).
`hermes acp --check` verifiziert die Abhängigkeiten.

**Dashboard-Themes.** `$HERMES_HOME/dashboard-themes/*.yaml`, gelesen bei jedem Aufruf von
`GET /api/dashboard/themes`. Struktur: `name`, `description`, `palette`
(`background`, `midground`, `foreground` je `{hex, alpha}` oder Hex-String, `warmGlow`,
`noiseOpacity`), `typography` (`fontSans`, `fontMono`, `fontDisplay`, `fontUrl`, `baseSize`,
`lineHeight`, `letterSpacing`), `layout` (`radius`, `density` ∈ compact|comfortable|spacious),
`colorOverrides` (nur diese Schlüssel: `card`, `cardForeground`, `popover`, `popoverForeground`,
`primary`, `primaryForeground`, `secondary`, `secondaryForeground`, `muted`, `mutedForeground`,
`accent`, `accentForeground`, `destructive`, `destructiveForeground`, `success`, `warning`,
`border`, `input`, `ring`), `components` (Buckets `card`, `header`, `footer`, `sidebar`, `tab`,
`progress`, `badge`, `backdrop`, `page`), `assets`, `customCSS` (≤ 32 KiB).

**Icon.** `~/.hermes/hermes-agent/acp_registry/icon.svg`, 882 Bytes, Caduceus,
`viewBox="0 0 16 16"`, durchgehend `currentColor`. Lizenz MIT © 2025 Nous Research.

---

## 3. Technische Leitentscheidungen

### 3.1 Hybride Integration

| Fläche | Umsetzung |
|---|---|
| Chat, Sessionliste, Toolkarten, Freigaben, Stoppen | **Nativ** in React, Transport ACP über eine Workbench-WebSocket-Brücke |
| Status, aktive Aufgaben, Automatisierungen, Ergebnisse | **Nativ**, Daten aus der Dashboard-REST-API über einen serverseitigen Client |
| Verwaltung (Config, API-Schlüssel, Skills, MCP, Memory, Cron, Logs, Profile) | **Offizielle Hermes-SPA im Iframe** unter `/hermes/` |

### 3.2 Warum ACP und nicht die TUI-Brücke

| Kriterium | ACP (`hermes acp`) | Dashboard-PTY (`/api/pty`, `--tui`) |
|---|---|---|
| Anforderung „keine TUI im Terminal" | erfüllt | verletzt |
| Strukturierte Tool-Calls | ja (`tool_call`, `tool_call_update`) | nein (ANSI-Text) |
| Freigaben interaktiv | ja (`session/request_permission`) | nur als Textprompt im PTY |
| Streaming | ja (Chunks) | ja (Bytes) |
| Abbrechen | ja (`cancel`) | nur Ctrl-C ins PTY |
| Sessions geteilt mit Telegram/Cron | ja (`state.db`) | ja |
| Modellwechsel | ja (`set_session_model`) | nur per Slash-Befehl |
| Zusätzliche Angriffsfläche | keine (stdio, kein Port) | offener WS mit Token in der URL |

Konsequenz: `--tui` bleibt **aus**. Damit sind `/api/pty`, `/api/pub` und `/api/events`
serverseitig geschlossen (Close 4403) — ein Sicherheitsgewinn nebenbei.

### 3.3 Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| Hermes-Desktop-Electron-App headless streamen | Verstößt gegen die Performance-Anforderungen, zweiter Chromium, kein Mehrwert |
| Checkout in ein Repo-Laufzeitverzeichnis verschieben | Bricht `hermes update` (git pull), `hermes doctor`, Gateway-Unit — siehe Befund 3 |
| T3-Proxy kopieren | Falsches `Host`-Verhalten (Befund 4) und globale Root-Routen (`/`, `/assets/*`, `/ws`) |
| Eigene Cron-/Skills-/MCP-Oberfläche nachbauen | Doppelte Pflege; die offizielle SPA ist vollständig und wird eingebettet |
| Eigene Session-Datenbank in der Workbench | Verstößt gegen „ein Datenbestand"; `state.db` ist die Quelle |
| Hermes-Port per Tailscale Serve veröffentlichen | Dashboard hat keine robuste Authentifizierung und zeigt API-Schlüssel |
| Frontend-Import aus dem Hermes-Checkout | `hermes update` würde den Workbench-Build brechen |

### 3.4 Prozess- und Datenfluss

```
Browser (https://<tailscale-host>/workbench/hermes-agent)
│
├─ Chat    wss://…/api/v1/hermes/chat            (same-origin, Tailscale-Identität)
│            └─ Fastify HermesChatBridge
│                 └─ ACP-Manager  ──stdio JSON-RPC──▶  hermes acp (Kindprozess)
│                                                        └─ ~/.hermes/state.db
├─ Daten   https://…/api/v1/hermes/*             (Status, Sessions, Cron, Ergebnisse)
│            └─ HermesDashboardClient  ──HTTP──▶  127.0.0.1:9119  (Session-Token)
│
└─ Verwaltung  <iframe src="/hermes/">
             └─ HermesDashboardProxy  ──HTTP/WS──▶  127.0.0.1:9119
                  Host: 127.0.0.1:9119 ; X-Forwarded-Prefix: /hermes

Telegram ──▶ hermes-gateway.service ──▶ ~/.hermes/state.db  (derselbe Bestand)
Cron     ──▶ Gateway-Scheduler      ──▶ ~/.hermes/state.db
```

---

## 4. Verbindliche Produktentscheidungen

Unverändert aus Fassung 1, mit Präzisierungen in Kursiv.

### 4.1 Navigation

1. In `Werkzeuge` steht **direkt unter `T3 Code`** der Eintrag `Hermes Agent`.
2. Es wird das offizielle Hermes-Icon verwendet, keine freie Nachzeichnung.
   *Quelle: `acp_registry/icon.svg`, MIT.*
3. Der Klick öffnet standardmäßig den **nativen Chat**.
4. Innerhalb des Hermes-Bereichs gibt es einen kompakten Wechsel `Chat` ↔ `Verwaltung`.
5. In der Verwaltung bleibt die offizielle Hermes-Navigation vollständig sichtbar.
6. Die zuletzt besuchte Verwaltungsseite wird gespeichert und wiederhergestellt.
7. Sensible Seiten (API-Schlüssel, Konfiguration) bleiben direkt erreichbar.
8. Keine zusätzliche Hermes-Anmeldung. *Das Session-Token bleibt vor dem Benutzer verborgen.*

### 4.2 Chat

1. Klassische, ChatGPT-ähnliche Nachrichtenoberfläche — **keine** TUI in einem Terminal.
2. Antworten werden gestreamt.
3. Tool-Aufrufe und Terminalbefehle sind vollständig sichtbar.
4. Freigaben und Rückfragen werden interaktiv dargestellt.
   *Freigaben verfallen nach `approvals.timeout` (60 s) — die Karte zeigt das an.*
5. Laufende Aufgaben haben eine sichtbare Stopptaste, ohne Menü erreichbar.
6. Dauerhaft sichtbare Sessionliste links, ein- und ausklappbar; mobil als Drawer.
7. Mehrere Hermes-Panels gleichzeitig, mit unterschiedlichen Sessions.
8. Ein geschlossenes Panel löscht **keine** gespeicherte Session.
9. Hermes startet **ungebunden**, auch wenn ein Projekt ausgewählt ist.
10. Eine Projektbindung ist optional und kann nachträglich gesetzt werden.
    *Technisch entspricht sie dem `cwd` einer neuen ACP-Session.*
11. Normale Dateiänderungen ohne Einzelbestätigung; destruktive Aktionen mit Bestätigung.
12. Kein pauschaler, unkontrollierter Rootzugriff.

### 4.3 Kompakter Header

Standardmäßig sichtbar: `Hermes Agent`, Anbieter, Modell, Verbindungsstatus, Drei-Punkte-Menü.

Im Menü mindestens: Neuer Chat · Session wechseln · Modell wechseln · Projekt verbinden/lösen ·
Verwaltung öffnen · Gateway neu starten · Dashboard neu starten · Nach Updates suchen ·
Update ausführen · Diagnose öffnen.

Während eine Aufgabe läuft, ist die Stopptaste ohne Menü erreichbar.

### 4.4 Workbench

Hermes ist ein globales Werkzeug wie Terminal, Codex, OpenCode und Browser: funktioniert ohne
Projekt, ist als Paneltyp verfügbar, mehrfach instanziierbar, bleibt beim Wechsel zwischen
Arbeitsflächen gemountet, speichert Session-ID, Oberflächenwahl und optionale Projektbindung,
startet im Chatmodus und unterstützt Vollbild, Neuladen, eigener Tab und Schließen.

### 4.5 Orbit

Version 1 enthält fünf Hermes-Flächen: `Hermes Chat` (als Werkzeugknoten), `Hermes Status`,
`Aktive Aufgaben`, `Automatisierungen`, `Ergebnisse` — Inhalte wie in Fassung 1 beschrieben,
Feldzuordnung siehe [Phase 11](#phase-11-orbit-integration).
Die offizielle Cron-Oberfläche bleibt die primäre Bearbeitungsfläche.

### 4.6 Benachrichtigungen

Neue Ergebnisse aus Web-Chat, Telegram, Cron und dem Update-Dienst erscheinen als dauerhafte
Benachrichtigung mit Ungelesen-Zähler. Fehler bleiben bis zum Lesen oder Bestätigen erfasst.
Für abonnierte Geräte kann der Server Push senden.

### 4.7 Responsive Design

Desktop und Tablet-Querformat: Sessionliste links. Tablet-Hochformat: eingeklappt erlaubt.
Smartphone: Drawer. Composer bleibt bei virtueller Tastatur benutzbar. Stopptaste, Freigaben und
Rückfragen sind touchfreundlich (≥ 44 px). Keine unkontrollierten horizontalen Überläufe.
Es gelten die vorhandenen Responsive-Shell-Muster (`useResponsiveShell`, `useMediaQuery`).

### 4.8 Design

Bestehendes dunkles System, dunkle Pastellgrün-Akzentfarbe, vorhandene Typografie-, Spacing-,
Radius-, Border- und Oberflächen-Token. Kein Glow, keine auffälligen Gradients, keine gelbe
Hermes-Farbwelt. Icon behält die Form, wird aber in das Iconsystem eingefärbt. Chat ruhig,
kompakt und informationsdicht. Toolkarten kompakt und aufklappbar. Fehler, Freigaben und aktive
Vorgänge sofort erkennbar. Die Verwaltungsoberfläche darf ihre zweite Navigation behalten und
wird über das offizielle Theme-System angeglichen.

---

## 5. Phasenplan

### Phase 0: Bestandsaufnahme und Sicherung

**Vor jeder Änderung.**

```bash
# Zustand festhalten (Ausgabe in den Implementierungsbericht, ohne Secrets)
hermes version
hermes doctor
hermes status
systemctl --user status hermes-gateway.service --no-pager
git -C ~/.hermes/hermes-agent rev-parse HEAD
git -C ~/.hermes/hermes-agent status --short

# Vollständiges Backup von HERMES_HOME (offizieller Weg)
hermes backup
```

Zusätzlich sichern (außerhalb des Repos, z. B. `~/.hermes-backup-<zeitstempel>/`):
`~/.hermes/config.yaml`, `~/.hermes/auth.json`, `~/.config/systemd/user/hermes-gateway.service`.

**Verboten:** Secrets in Logs, in das Repository oder in den Bericht kopieren.
`~/.hermes/auth.json`, `~/.hermes/config.yaml` (enthält Modell-/Provider-Daten) und
`.env`-Inhalte bleiben außen vor.

**Abschluss dieser Phase:** Ein Backup-ZIP existiert, der Git-SHA des Checkouts ist notiert.

---

### Phase 1: Zentrale Konfiguration

**Datei:** `apps/server/src/config/workbench-config.ts`

Neuer Abschnitt im `workbenchConfigSchema`, analog zum `t3`-Block (`.prefault({})`, damit
ältere Konfigurationen ohne den Abschnitt weiter laden):

```ts
hermes: z.object({
  enabled: z.boolean().default(true),
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().positive().default(9119),
  proxyPrefix: z.string().startsWith("/").max(64).default("/hermes"),
  // Absolute Pfade werden beim Installationslauf erkannt und hier festgeschrieben.
  cliPath: absolutePath.optional(),          // ~/.local/bin/hermes
  homeDirectory: absolutePath.optional(),    // HERMES_HOME, Default <home>/.hermes
  checkoutDirectory: absolutePath.optional(),// <HERMES_HOME>/hermes-agent
  pythonPath: absolutePath.optional(),       // <checkout>/venv/bin/python
  dashboardServiceUnit: z.string().min(1).default("hermes-dashboard.service"),
  gatewayServiceUnit: z.string().min(1).default("hermes-gateway.service"),
  updateServiceUnit: z.string().min(1).default("hermes-update.service"),
  defaultSurface: z.enum(["chat", "admin"]).default("chat"),
  updateTime: z.string().regex(/^\d{2}:\d{2}$/).default("04:15"),
  updateTimezone: z.string().min(1).default("Europe/Berlin"),
  // Betriebsparameter
  requestTimeoutSeconds: z.number().int().positive().default(20),
  startTimeoutSeconds: z.number().int().positive().default(120),
  acpMaxSessions: z.number().int().min(1).max(32).default(8),
  acpIdleTimeoutSeconds: z.number().int().positive().default(3_600),
  statusPollSeconds: z.number().int().min(5).max(300).default(30),
  taskPollSeconds: z.number().int().min(2).max(120).default(6),
  resultPollSeconds: z.number().int().min(5).max(300).default(20),
}).prefault({}),
```

**Portkollision** in `superRefine` ergänzen (das Muster für `t3.port` existiert bereits):

```ts
const reservedPorts = [config.t3.port, ...config.previews.slotPorts, ...config.previews.publicPorts];
if (reservedPorts.includes(config.hermes.port)) {
  context.addIssue({ code: "custom", path: ["hermes", "port"], message: "Der Hermes-Port kollidiert mit einem bereits belegten Port." });
}
if (!["127.0.0.1", "::1", "localhost"].includes(config.hermes.host)) {
  context.addIssue({ code: "custom", path: ["hermes", "host"], message: "Das Hermes-Dashboard darf nur an Loopback binden." });
}
```

**Datei:** `apps/server/src/config/settings.ts`

`settingsSchema` um Env-Overrides erweitern (`HERMES_ENABLED`, `HERMES_HOST`, `HERMES_PORT`,
`HERMES_CLI_PATH`, `HERMES_HOME`, `HERMES_PROXY_PREFIX`, `HERMES_DASHBOARD_UNIT`,
`HERMES_GATEWAY_UNIT`) mit Defaults aus `wb.hermes`, und im exportierten `settings`-Objekt
einen `hermes`-Block ergänzen. Die `listenerPorts`-Eindeutigkeitsprüfung (Z. 184) um
`environment.HERMES_PORT` erweitern.

**Ableitung fehlender Pfade** (in `settings.ts`, keine harten Pfade im Code):

```ts
const hermesHome = environment.HERMES_HOME || wb.hermes.homeDirectory || join(wb.system.homeDirectory, ".hermes");
const hermesCheckout = wb.hermes.checkoutDirectory ?? join(hermesHome, "hermes-agent");
const hermesPython   = wb.hermes.pythonPath      ?? join(hermesCheckout, "venv/bin/python");
const hermesCli      = environment.HERMES_CLI_PATH || wb.hermes.cliPath || join(wb.system.homeDirectory, ".local/bin/hermes");
```

**Weitere Dateien:** `config/workbench.example.json` (kommentierter `hermes`-Block),
`.env.example` (neue Variablen), `docs/configuration.md` (neuer Abschnitt „Hermes Agent").
`config/workbench.local.json` bleibt gitignored und wird beim Installationslauf ergänzt.

**Keine Secrets** in der Workbench-Konfiguration. Provider-Schlüssel bleiben in `~/.hermes`.

**Tests:** `apps/server/src/config/workbench-config.test.ts` um Fälle erweitern:
fehlender `hermes`-Block lädt (Defaults), nicht-Loopback-Host schlägt fehl,
Portkollision mit T3/Preview schlägt fehl, Präfix ohne führenden Slash schlägt fehl.

---

### Phase 2: Gemeinsame Contracts

**Datei:** `packages/contracts/src/index.ts`

#### 2.1 Paneltyp

```ts
export const panelTypeSchema = z.enum([
  "t3-code", "code-server", "preview", "browser",
  "terminal", "codex", "opencode", "files", "hermes", "notion",
]);
```

`panelSchema` erhält **flache optionale** Felder (Muster `browserUrl`), damit bereits
gespeicherte Arbeitsflächen im `localStorage` unverändert weiter parsen:

```ts
export const panelSchema = z.object({
  // … bestehende Felder …
  browserUrl: z.string().trim().min(1).max(2_048).optional(),
  // Hermes: nur für Panels vom Typ "hermes" gesetzt. Optional, damit alte
  // gespeicherte Arbeitsflächen ohne Migration gültig bleiben.
  hermesSurface: z.enum(["chat", "admin"]).optional(),
  hermesSessionId: z.string().min(1).max(200).nullable().optional(),
  hermesAdminPath: z.string().startsWith("/").max(512).optional(),
  hermesSidebarCollapsed: z.boolean().optional(),
});
```

Die Projektbindung nutzt das vorhandene `Panel.projectId` — **kein** zweites Projektfeld.

#### 2.2 Statusvertrag

```ts
export const hermesServiceStateSchema = z.enum(["active", "inactive", "failed", "activating", "unknown"]);
export const hermesUpdateResultSchema = z.enum(["success", "failed", "deferred", "none"]);

export const hermesStatusSchema = z.object({
  enabled: z.boolean(),
  installed: z.boolean(),
  reachable: z.boolean(),
  version: z.string().nullable(),
  commit: z.string().max(40).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  dashboard: z.object({
    state: hermesServiceStateSchema,
    reachable: z.boolean(),
    url: z.string().nullable(),          // immer der Proxy-Pfad, nie 127.0.0.1:<port>
  }),
  gateway: z.object({
    state: hermesServiceStateSchema,
    telegramConnected: z.boolean().nullable(),
    lastError: z.string().max(500).nullable(),
  }),
  chat: z.object({
    transport: z.enum(["acp", "unavailable"]),
    ready: z.boolean(),
    activeSessions: z.number().int().nonnegative(),
  }),
  update: z.object({
    available: z.boolean(),
    pending: z.boolean(),
    running: z.boolean(),
    currentVersion: z.string().nullable(),
    latestVersion: z.string().nullable(),
    lastCheckedAt: isoDateSchema.nullable(),
    lastUpdatedAt: isoDateSchema.nullable(),
    lastResult: hermesUpdateResultSchema,
  }),
  checkedAt: isoDateSchema,
});
```

#### 2.3 Sessions, Aufgaben, Ergebnisse, Cron

```ts
export const hermesSessionSourceSchema = z.enum(["web", "cli", "telegram", "cron", "acp", "other"]);

export const hermesSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  source: hermesSessionSourceSchema,
  model: z.string().nullable(),
  provider: z.string().nullable(),
  cwd: z.string().nullable(),
  projectId: z.string().nullable(),      // aufgelöst über die Projektregistry
  messageCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema.nullable(),
  status: z.enum(["idle", "running", "failed", "unknown"]),
});

export const hermesTaskSchema = z.object({
  id: z.string().min(1),                 // stabile Remote-ID zur Deduplizierung
  sessionId: z.string().min(1),
  title: z.string().max(200),
  source: hermesSessionSourceSchema,
  model: z.string().nullable(),
  startedAt: isoDateSchema,
  runtimeSeconds: z.number().int().nonnegative(),
  cancellable: z.boolean(),
});

export const hermesResultSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  source: hermesSessionSourceSchema,
  status: z.enum(["success", "failed"]),
  title: z.string().max(200),
  preview: z.string().max(400),          // serverseitig gekürzt, redigiert
  finishedAt: isoDateSchema,
  cronJobId: z.string().nullable(),
});

export const hermesCronJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  schedule: z.string().max(120),
  enabled: z.boolean(),
  nextRunAt: isoDateSchema.nullable(),
  lastRunAt: isoDateSchema.nullable(),
  lastStatus: z.enum(["success", "failed", "running", "unknown"]),
  adminPath: z.string().startsWith("/"), // Deep-Link in die offizielle Cron-Seite
});
```

#### 2.4 Chat-Protokoll (versioniert, entkoppelt vom ACP-Detail)

Das Frontend spricht **nie** direkt ACP. Das interne Protokoll bleibt stabil, auch wenn
Hermes seine ACP-Schicht ändert.

```ts
export const HERMES_CHAT_PROTOCOL_VERSION = 1;

export const hermesClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("session.create"), projectId: z.string().nullable(), title: z.string().max(200).optional() }),
  z.object({ v: z.literal(1), type: z.literal("session.attach"), sessionId: z.string().min(1) }),
  z.object({ v: z.literal(1), type: z.literal("session.detach") }),
  z.object({ v: z.literal(1), type: z.literal("message.send"), sessionId: z.string().min(1), clientMessageId: z.string().uuid(), content: z.string().min(1).max(200_000) }),
  z.object({ v: z.literal(1), type: z.literal("task.cancel"), sessionId: z.string().min(1) }),
  z.object({ v: z.literal(1), type: z.literal("approval.respond"), requestId: z.string().min(1), option: z.enum(["allow_once", "allow_session", "deny"]) }),
  z.object({ v: z.literal(1), type: z.literal("model.set"), sessionId: z.string().min(1), model: z.string().min(1).max(200) }),
  z.object({ v: z.literal(1), type: z.literal("ping") }),
]);

export const hermesServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("session.ready"), session: hermesSessionSchema, replayComplete: z.boolean() }),
  z.object({ v: z.literal(1), type: z.literal("message.appended"), sessionId: z.string(), message: hermesMessageSchema }),
  z.object({ v: z.literal(1), type: z.literal("message.delta"), sessionId: z.string(), messageId: z.string(), delta: z.string() }),
  z.object({ v: z.literal(1), type: z.literal("message.complete"), sessionId: z.string(), message: hermesMessageSchema }),
  z.object({ v: z.literal(1), type: z.literal("thought.delta"), sessionId: z.string(), delta: z.string() }),
  z.object({ v: z.literal(1), type: z.literal("tool.update"), sessionId: z.string(), toolCall: hermesToolCallSchema }),
  z.object({ v: z.literal(1), type: z.literal("approval.requested"), request: hermesApprovalSchema }),
  z.object({ v: z.literal(1), type: z.literal("approval.resolved"), requestId: z.string(), option: z.string(), reason: z.enum(["answered", "expired", "cancelled"]) }),
  z.object({ v: z.literal(1), type: z.literal("commands.available"), sessionId: z.string(), commands: z.array(hermesSlashCommandSchema) }),
  z.object({ v: z.literal(1), type: z.literal("task.state"), sessionId: z.string(), state: z.enum(["idle", "running", "cancelling"]) }),
  z.object({ v: z.literal(1), type: z.literal("usage"), sessionId: z.string(), usage: hermesUsageSchema }),
  z.object({ v: z.literal(1), type: z.literal("error"), code: hermesErrorCodeSchema, message: z.string().max(500), sessionId: z.string().nullable() }),
  z.object({ v: z.literal(1), type: z.literal("pong") }),
]);
```

`hermesMessageSchema` deckt `role` ∈ `user|assistant|system`, `content` (Markdown),
`toolCalls`, `createdAt`, `truncated` ab.
`hermesToolCallSchema` deckt `id`, `name`, `kind` ∈ `terminal|edit|read|search|browser|other`,
`status` ∈ `pending|running|completed|failed`, `title`, `arguments` (redigiert), `result`
(gekürzt), `command`, `cwd`, `exitCode`, `startedAt`, `durationMs`, `truncated` ab.
`hermesApprovalSchema` deckt `requestId`, `sessionId`, `toolCallId`, `title`, `description`,
`command`, `risk` ∈ `low|medium|high`, `options` (nur die von Hermes gemeldeten),
`expiresAt` ab.
`hermesErrorCodeSchema`: `HERMES_DISABLED`, `HERMES_NOT_INSTALLED`, `DASHBOARD_UNREACHABLE`,
`ACP_UNAVAILABLE`, `ACP_CRASHED`, `SESSION_NOT_FOUND`, `SESSION_BUSY`, `PROJECT_NOT_FOUND`,
`PROJECT_FORBIDDEN`, `APPROVAL_EXPIRED`, `RATE_LIMITED`, `UPDATE_RUNNING`, `INVALID_MESSAGE`,
`INTERNAL_ERROR`.

#### 2.5 Benachrichtigungen (generisch, nicht hermes-spezifisch)

```ts
export const notificationSourceSchema = z.enum(["hermes", "workbench", "update"]);
export const notificationSeveritySchema = z.enum(["info", "success", "warning", "error"]);
export const notificationSchema = z.object({
  id: z.string().uuid(),
  source: notificationSourceSchema,
  kind: z.string().min(1).max(64),          // z.B. "hermes.result", "hermes.update"
  severity: notificationSeveritySchema,
  title: z.string().min(1).max(200),
  body: z.string().max(1_000),
  link: z.string().max(512).nullable(),     // interner Pfad, nie extern
  remoteId: z.string().max(200).nullable(), // Deduplizierungsschlüssel
  createdAt: isoDateSchema,
  readAt: isoDateSchema.nullable(),
  acknowledgedAt: isoDateSchema.nullable(),
});
export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
  unacknowledgedErrorCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
```

#### 2.6 Orbit-Schema

```ts
export const orbitNodeTypeSchema = z.enum([
  "project", "tool", "previewGroup", "previewSlot", "note", "todo", "snippet",
  "file", "asset", "gallery", "fileGallery", "frame", "usage",
  "hermesStatus", "hermesTasks", "hermesCron", "hermesResults",
]);
```

`orbitNodeSchema` bekommt zwei neue Felder mit Defaults (flach, wie alle anderen):

```ts
hermesSourceFilter: z.enum(["all", "web", "telegram", "cron"]).default("all"),
hermesStatusFilter: z.enum(["all", "success", "failed"]).default("all"),
```

`superRefine` ergänzen: die beiden Felder dürfen nur bei `hermesResults` bzw. `hermesTasks` von
`"all"` abweichen — bewusst weich formuliert, damit alte Dokumente nicht ungültig werden.

**Dokumentversion.** `ORBIT_DOCUMENT_VERSION = 8`, `version: z.union([z.literal(6), z.literal(7), z.literal(8)])`.
Gelesen werden 6, 7 und 8; geschrieben wird 8. Die neuen Felder haben Defaults, deshalb parsen
v6/v7-Dokumente unverändert und werden beim ersten Speichern angehoben.
**Kein destruktiver Migrationsschritt.** `apps/server/src/orbit/database.ts` schreibt bereits
Revisionsbackups (`orbitRevisionRetentionCount`) — die bleiben der Rückweg.

#### 2.7 Typexporte

`HermesStatus`, `HermesSession`, `HermesTask`, `HermesResult`, `HermesCronJob`,
`HermesMessage`, `HermesToolCall`, `HermesApproval`, `HermesClientMessage`,
`HermesServerMessage`, `Notification` am Dateiende ergänzen.

**Danach:** `pnpm --filter @workbench/contracts build`.

---

### Phase 3: Installations- und Datenstrategie

**Grundsatz: nichts umziehen.** Checkout, `HERMES_HOME`, venv, Gateway-Unit, Sessions, Memory,
Skills, Cronjobs, Pairing und Telegram-Konfiguration bleiben, wo sie sind.

**Neues Skript:** `scripts/install-hermes.sh` — idempotent, ohne `sudo`, mit `set -euo pipefail`.

Ablauf:

1. **Erkennen.** `command -v hermes`; `hermes version` parsen (`Project:`-Zeile ⇒ Checkout);
   `HERMES_HOME` aus Env oder `<home>/.hermes`; `venv/bin/python` prüfen.
   Fehlt Hermes, mit klarer Meldung abbrechen — dieses Skript **installiert Hermes nicht neu**.
2. **Sichern.** `hermes backup` ausführen, Pfad des ZIPs ausgeben.
3. **Config ergänzen.** Erkannte Pfade und den freien Port nach `config/workbench.local.json`
   schreiben — nach dem Muster von `persistT3Channel` (nur die betroffenen Felder, temporäre
   Datei + `rename`, `chmod 0600`, vorher gegen `workbenchConfigSchema` validieren).
4. **Dashboard-SPA bauen** (der in Fassung 1 fehlende Schritt):
   ```bash
   cd "$checkout/web" && npm ci --no-audit --no-fund && npm run build
   test -f "$checkout/hermes_cli/web_dist/index.html"
   ```
   Ohne Node/npm: klare Fehlermeldung, Abbruch, keine halbe Installation.
5. **Theme installieren.** `deploy/hermes/dashboard-themes/remote-workplace.yaml` nach
   `$HERMES_HOME/dashboard-themes/` kopieren (idempotent, Zieldatei überschreiben).
   Theme im Dashboard aktivieren: `PUT /api/dashboard/theme` oder `dashboard.theme` in
   `config.yaml` setzen.
6. **Gateway übernehmen, nicht ersetzen.** Vorhandene `hermes-gateway.service` bleibt
   unverändert. Ist sie nicht `enabled`, wird sie aktiviert. **Keine zweite Instanz.**
7. **Units rendern und installieren** (siehe [Phase 5](#phase-5-systemdienste)):
   `node deploy/systemd/render-units.mjs` → `systemd-analyze verify` →
   `install -m 0644` nach `~/.config/systemd/user/` → `systemctl --user daemon-reload` →
   `systemctl --user enable --now hermes-dashboard.service hermes-update.timer`.
8. **Approval-Hygiene** (siehe [Phase 13](#phase-13-sicherheit-und-approvals)):
   `approvals.mode` auf `ask` setzen und die gefährlichen `command_allowlist`-Einträge zur
   Entfernung vorschlagen. **Nicht stillschweigend ändern** — Vorher/Nachher ausgeben.
9. **Healthchecks.** Dashboard-HTTP, Proxy über die Workbench, `hermes acp --check`,
   Gateway-Status.
10. **Fehlerpfad.** Bei Abbruch: `trap` stellt gesicherte Unit-Dateien zurück, entfernt neu
    installierte Units, `daemon-reload`, und gibt die Wiederherstellungsschritte aus.

**`.gitignore`** ergänzen, falls neue lokale Artefakte entstehen. Der Hermes-Checkout liegt
außerhalb des Repos und ist damit ohnehin nicht betroffen.

---

### Phase 4: Sicherheit des Zugangswegs (vorgezogen)

Diese Änderungen müssen **vor** dem ersten Aktivieren des Proxys wirksam sein.

**Datei:** `apps/server/src/security/workbench-identity.ts`

```ts
const protectedPrefixes = [
  "/api/",
  "/editor",
  "/t3",
  "/hermes",        // NEU — ohne diese Zeile wäre die Hermes-Verwaltung
  "/assets/",       //        inklusive API-Schlüssel ohne Identitätsprüfung erreichbar.
  "/.well-known/t3/",
  "/api/auth/",
];
```

**Test:** `apps/server/src/app.test.ts` bzw. eine neue
`apps/server/src/security/workbench-identity.test.ts` mit dem Fall
„`GET /hermes/api/config` ohne `tailscale-user-login` ⇒ 401" und
„`POST /hermes/api/config` mit fremdem Origin ⇒ 403".

**Netzwerkgrenzen (unverändert einzuhalten).**

1. Dashboard bindet nur auf `127.0.0.1`; `--insecure` wird nie verwendet.
2. Keine Tailscale-Serve-Regel und kein Funnel für Port 9119.
3. Zugriff ausschließlich über den Workbench-Proxy.
4. WS-Verbindungen prüfen Origin (`isSameOriginRequest`) und Identität.
5. Keine CORS-Wildcards.
6. Der DNS-Rebinding-Schutz von Hermes bleibt aktiv (wir setzen den korrekten `Host`, statt
   ihn zu umgehen).

---

### Phase 5: Systemdienste

**Alle Units sind User-Units.** Kein `sudo`, kein Root-Helper, keine `sudoers`-Regel.
Steuerung immer mit `XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user …`.

**Neue Templates in `deploy/systemd/units/`** (Platzhalter im `__TOKEN__`-Stil, gefüllt von
`render-units.mjs` aus `config/workbench.local.json`):

#### `hermes-dashboard.service`

```ini
# Hermes-Dashboard — die offizielle Verwaltungsoberfläche, eingebettet über /hermes.
# User-Unit wie workbench.service und t3-code.service; es ist kein root nötig.
# --skip-build: die SPA wird von scripts/install-hermes.sh bzw. vom Update-Dienst
# gebaut. Ohne das Flag baut jeder Start die SPA neu und dauert Minuten.
# --no-open: headless, es gibt keinen Browser auf dem Server.
[Unit]
Description=Hermes Agent Dashboard (Workbench, Port __HERMES_PORT__)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=__HERMES_CHECKOUT__
Environment=HOME=__HOME__
Environment=HERMES_HOME=__HERMES_HOME__
Environment=PATH=__HERMES_CHECKOUT__/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=__HERMES_CHECKOUT__/venv/bin/python -m hermes_cli.main dashboard \
  --host __HERMES_HOST__ --port __HERMES_PORT__ --no-open --skip-build
Restart=always
RestartSec=5s
TimeoutStopSec=20s
KillSignal=SIGTERM
KillMode=mixed
UMask=0077

[Install]
WantedBy=default.target
```

`Restart=always` ist bewusst gewählt: `hermes update` beendet laufende Dashboard-Prozesse
selbst (`_kill_stale_dashboard_processes`) und startet sie **nicht** wieder.
`KillMode=mixed` beendet uvicorn-Worker sauber mit.

#### `hermes-update.service` (oneshot)

```ini
[Unit]
Description=Hermes Agent Update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=HOME=__HOME__
Environment=HERMES_HOME=__HERMES_HOME__
Environment=PATH=__HERMES_CHECKOUT__/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=__REPO_ROOT__/scripts/hermes-update.sh
TimeoutStartSec=3600
UMask=0077
```

#### `hermes-update.timer`

```ini
[Unit]
Description=Taeglicher Hermes-Updatelauf

[Timer]
# Die Systemzeitzone ist Etc/UTC. Ohne die explizite Zone liefe der Lauf um
# 06:15 (Sommer) bzw. 05:15 (Winter) Ortszeit. systemd 255 unterstuetzt die
# Zonenangabe im Kalender-Ausdruck (seit v252).
OnCalendar=*-*-* __HERMES_UPDATE_TIME__:00 __HERMES_UPDATE_TZ__
Persistent=true
AccuracySec=1min
RandomizedDelaySec=5min
Unit=hermes-update.service

[Install]
WantedBy=timers.target
```

#### `hermes-update-retry.timer`

```ini
[Unit]
Description=Wiederholter Hermes-Updateversuch bei aktiver Arbeit

[Timer]
OnUnitActiveSec=30min
OnBootSec=30min
Unit=hermes-update.service

[Install]
WantedBy=timers.target
```

Der Retry-Timer läuft dauerhaft; das Skript beendet sich sofort mit `exit 0`, wenn kein
`pending`-Zustand gesetzt ist. Das ist einfacher und robuster als ein dynamisch aktivierter
Timer und erzeugt praktisch keine Last.

#### Dienststeuerung aus dem Backend

**Datei:** `apps/server/src/hermes/service-control.ts`

```ts
const hermesServiceActionSchema = z.object({
  target: z.enum(["dashboard", "gateway"]),
  action: z.enum(["start", "stop", "restart"]),
});

const unitFor = {
  dashboard: settings.hermes.dashboardServiceUnit,
  gateway: settings.hermes.gatewayServiceUnit,
} as const;

await execFile("systemctl", ["--user", request.action, unitFor[request.target]], {
  env: { ...process.env, XDG_RUNTIME_DIR: `/run/user/${process.getuid!()}` },
  timeout: settings.hermes.requestTimeoutSeconds * 1_000,
  // kein shell:true — keine Shell-Interpretation, keine Argumentinjektion
});
```

Verbindlich:

1. Nur `execFile`, nie `exec`/`shell: true`.
2. Der Unitname kommt **ausschließlich** aus der Zuordnungstabelle, nie aus der Anfrage.
3. Enum-Validierung serverseitig, vor jedem Aufruf.
4. Jede Aktion wird über den vorhandenen `OperationalAuditDatabase`-Hook auditiert
   (`isAuditedMutation` deckt `POST /api/v1/...` bereits ab — prüfen und ggf. ergänzen).
5. Statusabfrage über `systemctl --user show -p ActiveState,SubState,Result --value <unit>`,
   Ergebnis auf `hermesServiceStateSchema` normalisieren (eigene, getestete Parserfunktion).

**Update-/Diagnoseaktionen** laufen über `systemctl --user start hermes-update.service`
bzw. direkt über das Skript — nie über beliebige, vom Client gelieferte Argumente.

---

### Phase 6: Hermes-Backend-Adapter

**Neues Verzeichnis:** `apps/server/src/hermes/` (Muster: `previews/`, `terminal/`, `browser/`).

```
apps/server/src/hermes/
  settings.ts            Abgeleitete Pfade, Präfix, Upstream-URLs
  token.ts               Session-Token holen, cachen, invalidieren
  client.ts              Typisierter HTTP-Client gegen das Dashboard
  dashboard-proxy.ts     Prefix-Proxy für /hermes  (Phase 7)
  acp/protocol.ts        ACP-Rahmen, JSON-RPC-Codec, Zod-Schemas
  acp/Manager.ts         Kindprozess, Sessions, Freigaben, Abbruch
  acp/normalize.ts       ACP-Ereignisse → internes Protokoll (rein, testbar)
  chat-bridge.ts         WebSocket-Route /api/v1/hermes/chat
  status-service.ts      Status, Capabilities, Cache
  session-service.ts     Sessions, Aufgaben, Ergebnisse, Cron (normalisiert)
  update-service.ts      Updatezustand lesen/schreiben, Lauf anstoßen
  diagnostics.ts         Diagnoselauf
  service-control.ts     systemctl --user (Phase 5)
  result-sync.ts         Poller für neue Ergebnisse → Benachrichtigungen
  routes.ts              REST-Registrierung
```

#### 6.1 Session-Token

Das Token ist ephemer und wechselt bei jedem Dashboard-Neustart.

```ts
// token.ts — Ablauf
// 1. GET http://127.0.0.1:<port>/  mit Host: 127.0.0.1:<port>, Accept: text/html
// 2. window.__HERMES_SESSION_TOKEN__="([A-Za-z0-9_-]{16,})" aus dem HTML lesen
// 3. Wert im Speicher halten (nie loggen, nie an den Browser senden, nie persistieren)
// 4. Bei 401 einer beliebigen API-Anfrage: Token verwerfen, genau einmal neu holen,
//    Anfrage einmal wiederholen. Zweites 401 ⇒ Fehler DASHBOARD_UNREACHABLE.
```

Dieser Weg ist der offiziell vorgesehene: das Vite-Dev-Plugin des Hermes-Dashboards
(`web/vite.config.ts`, `hermesDevToken`) macht exakt dasselbe.

**Nie** in Logs, Fehlermeldungen, Diagnoseausgaben oder im Implementierungsbericht.

#### 6.2 HTTP-Client

**Datei:** `apps/server/src/hermes/client.ts`

Anforderungen:

1. Ziel ausschließlich `http://<settings.hermes.host>:<settings.hermes.port>` — Loopback,
   in einer Zeile validiert.
2. `Host`-Header wird auf `<host>:<port>` gesetzt (Pflicht, siehe Befund 4).
3. `X-Hermes-Session-Token` für alle nicht-öffentlichen Pfade.
4. `AbortSignal.timeout(settings.hermes.requestTimeoutSeconds * 1000)`.
5. Antwortgröße begrenzen (Vorschlag: 4 MiB; darüber Abbruch mit `INTERNAL_ERROR`).
6. Zod-Parsing jeder Antwort; kein `any`, kein `as`.
7. Fehlernormalisierung auf `hermesErrorCodeSchema`; keine Upstream-Stacktraces nach außen.
8. Redigierung: Werte unter Schlüsseln, die `key|token|secret|password|authorization` matchen,
   werden vor jeder Weitergabe durch `"***"` ersetzt.
9. Ein kleiner Antwort-Cache (`apps/server/src/utils/cache.ts` existiert bereits) mit
   getrennten TTLs: Status 10 s, Sessions 3 s, Cron 15 s, Modelle 60 s.

#### 6.3 ACP-Manager — der Chat-Transport

**Datei:** `apps/server/src/hermes/acp/Manager.ts`

**Prozessmodell.** Genau **ein** langlebiger Kindprozess für alle Sessions:

```ts
spawn(settings.hermes.pythonPath, ["-m", "acp_adapter.entry"], {
  cwd: settings.hermes.checkoutDirectory,
  env: { HOME, HERMES_HOME, PATH: `${checkout}/venv/bin:/usr/bin:/bin` },
  stdio: ["pipe", "pipe", "pipe"],
});
```

`stdout` trägt JSON-RPC, `stderr` geht ins Fastify-Log auf `debug` (Hermes schreibt dort
Diagnose). Alternativ `settings.hermes.cliPath acp` — beide Wege sind gleichwertig; der
direkte Python-Aufruf umgeht einen Wrapper und ist im Unit-Kontext berechenbarer.

Verantwortlichkeiten:

1. **Lebenszyklus.** Lazy Start beim ersten Chat-Zugriff, nicht beim Serverstart.
   Health über `initialize`. Beendet sich der Prozess, wird er mit exponentiellem Backoff
   (1 s, 2 s, 4 s, 8 s, max. 30 s) neu gestartet; angebundene Clients bekommen
   `error: ACP_CRASHED` und danach `session.ready` mit Replay, sobald er wieder steht.
   Leerlauf über `acpIdleTimeoutSeconds` ohne offene Verbindung ⇒ sauberes Beenden.
2. **Sessions.** `session/new` mit `cwd`, `session/load` zum Wiederaufnehmen (das Adapter
   spielt die Historie als Updates zurück — `_replay_session_history`), `session/prompt`,
   `session/cancel`. Obergrenze `acpMaxSessions`.
3. **Freigaben.** Eingehende `session/request_permission` werden mit einer serverseitig
   erzeugten `requestId` an den Browser weitergereicht. Eine Antwort ist nur einmal gültig
   (Map `requestId → resolver`, danach gelöscht). Nach `approvals.timeout` (aus
   `config.yaml`, Default 60 s) wird die Anfrage serverseitig als abgelaufen markiert und der
   Browser bekommt `approval.resolved` mit `reason: "expired"`.
4. **Normalisierung.** Jede ACP-Nachricht geht durch `acp/normalize.ts` — eine **reine**
   Funktion ohne I/O, damit sie ohne laufenden Hermes testbar ist.
5. **Rückdruck.** Deltas werden pro Session gepuffert und in ≤ 50-ms-Fenstern gebündelt, damit
   ein schneller Stream nicht Tausende WS-Frames erzeugt.
6. **Projektbindung.** Die `cwd` kommt **nie** vom Browser. Der Browser sendet eine
   `projectId`; der Server löst sie über `projects.get(projectId)` auf, prüft
   `availability === "available"` und dass der Pfad in `settings.terminalAllowedRoots` liegt.
   Ohne Projekt: `settings.terminalDefaultCwd`.
7. **Kein Prompt-Umbau.** Der Benutzertext geht unverändert an `session/prompt`. Kein
   Präfix, kein Systemtext, kein Umschreiben — das würde Hermes' Prompt-Caching brechen.

#### 6.4 Chat-Brücke (WebSocket)

**Datei:** `apps/server/src/hermes/chat-bridge.ts`, Route `GET /api/v1/hermes/chat`
(`{ websocket: true }`). Vorbild: `apps/server/src/terminal/routes.ts:93`.

```ts
app.get("/hermes/chat", { websocket: true }, (socket, request) => {
  // 1. isSameOriginRequest(request)                    → sonst close(1008, "FORBIDDEN")
  // 2. Identität aus tailscale-user-login + allowedUsers → sonst close(1008, "UNAUTHORIZED")
  // 3. createWebSocketSendQueue<HermesServerMessage>({ socket, maxQueueBytes: 8 * 1024 * 1024 })
  // 4. Jede eingehende Nachricht durch hermesClientMessageSchema.parse
  // 5. Heartbeat: ping/pong alle 30 s, Timeout 90 s
});
```

Weitere Anforderungen:

- **Reconnect ohne Doppelsenden.** Jede `message.send` trägt eine `clientMessageId` (UUID).
  Der Server merkt sich die letzten 50 IDs pro Session; ein Wiederholungsversuch nach
  Reconnect wird verworfen und stattdessen der aktuelle Zustand zurückgespielt.
- **Browser-Refresh löscht nie eine Session.** Beim Verbindungsabbruch wird nur die
  WS-Anbindung entfernt, nie `session/cancel` oder ein Löschen ausgelöst.
- **Mehrere Panels auf derselben Session** sind erlaubt: Ereignisse werden an alle
  angebundenen Sockets derselben Session gefächert.
- **Fehlerfälle** liefern immer eine strukturierte `error`-Nachricht mit einem Code aus
  `hermesErrorCodeSchema` — nie einen rohen Stacktrace.

#### 6.5 Capability-Erkennung

`status-service.ts` ermittelt beim ersten Zugriff und danach höchstens alle 60 Sekunden:

| Prüfung | Quelle | Bei Fehlschlag |
|---|---|---|
| CLI vorhanden | `existsSync(cliPath)` | `installed: false`, UI zeigt Installationshinweis |
| Version/Commit | `GET /api/status`, `git rev-parse HEAD` | Feld `null` |
| Dashboard-Dienst | `systemctl --user show` | `state`, UI bietet Start an |
| Dashboard-HTTP | `GET /api/status` | `reachable: false`, Recovery-Screen |
| Sessions-API | `GET /api/sessions?limit=1` | Sessionliste zeigt Offline-Zustand |
| Cron-API | `GET /api/cron/jobs` | Automatisierungen-Knoten zeigt Offline-Zustand |
| Chat/ACP | `hermes acp --check` (gecacht, 10 min) | `transport: "unavailable"`, Chat deaktiviert mit Grund |
| Gateway | `systemctl --user show` + `GET /api/status` | Statusknoten zeigt Fehler |
| Update | `hermes update --check` (nur auf Anforderung) | letzter bekannter Zustand |

**Grundsatz:** Fehlt eine Fähigkeit, zeigt die UI eine klare Meldung mit nächster Aktion —
sie stürzt nicht ab und blendet den Bereich nicht kommentarlos aus.

#### 6.6 REST-Endpunkte

```
GET    /api/v1/hermes/status
GET    /api/v1/hermes/sessions?limit&cursor&q&source
GET    /api/v1/hermes/sessions/:id
DELETE /api/v1/hermes/sessions/:id           (nur mit Bestätigung im UI)
GET    /api/v1/hermes/tasks
GET    /api/v1/hermes/cron
GET    /api/v1/hermes/results?source&status&cursor
GET    /api/v1/hermes/models
POST   /api/v1/hermes/models/select
GET    /api/v1/hermes/diagnostics
POST   /api/v1/hermes/diagnostics/run
POST   /api/v1/hermes/services/action
GET    /api/v1/hermes/update/status
POST   /api/v1/hermes/update/check
POST   /api/v1/hermes/update/run
WS     /api/v1/hermes/chat

GET    /api/v1/notifications?cursor&unreadOnly
PATCH  /api/v1/notifications/:id             { read?: boolean, acknowledged?: boolean }
POST   /api/v1/notifications/read-all
DELETE /api/v1/notifications/:id
```

Alle Eingaben mit Zod validieren. Registrierung in `app.ts` nach dem Muster von
`registerPreviewRoutes` mit `prefix: "/api/v1"`.
Ist `settings.hermes.enabled === false`, werden die Routen registriert, antworten aber
einheitlich mit `HERMES_DISABLED` — so bleibt das Frontend ohne Sonderfall bedienbar.

---

### Phase 7: Dashboard-Proxy

**Datei:** `apps/server/src/hermes/dashboard-proxy.ts`, registriert in `app.ts` neben
`registerT3Proxy`.

**Der T3-Proxy wird nicht kopiert.** Er beansprucht Wurzelrouten (`/`, `/assets/*`, `/ws`,
`/favicon.ico`) und setzt den `Host` auf den Workbench-Host — beides wäre hier falsch.

#### 7.1 Routen

```ts
const prefix = settings.hermes.proxyPrefix;      // "/hermes"
const authority = `${settings.hermes.host}:${settings.hermes.port}`;

// Genau zwei Routen — alles unter dem Präfix, nichts darüber hinaus.
app.route({ method: "GET", url: prefix, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
app.route({
  method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  url: `${prefix}/*`,
  config: { rateLimit: false },
  helmet: false,
  handler: proxyHttp,
  wsHandler: proxyWebSocket,
});
```

`rateLimit: false` ist nötig, weil die SPA beim Laden dutzende Assets zieht und das globale
Limit (1200/min) hinter Tailscale ein gemeinsames Budget für alle Tabs ist.
`helmet: false`, weil das Dashboard eigene Header liefert; die globale CSP der Workbench bleibt
für alle anderen Routen unangetastet.

#### 7.2 Pfadumschreibung

```ts
function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://workbench.local");
  const pathname = url.pathname === prefix
    ? "/"
    : url.pathname.startsWith(`${prefix}/`)
      ? url.pathname.slice(prefix.length)
      : url.pathname;
  return `${pathname}${url.search}`;
}
```

#### 7.3 Header — der kritische Teil

```ts
function proxyHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  return {
    ...headers,
    // PFLICHT: Hermes' host_header_middleware weist jede Anfrage mit fremdem
    // Host mit 400 ab (DNS-Rebinding-Schutz). Der Workbench-Host darf hier
    // NICHT durchgereicht werden - anders als beim T3-Proxy.
    host: authority,
    // Damit rewritet Hermes index.html, CSS-url() und __HERMES_BASE_PATH__.
    "x-forwarded-prefix": prefix,
    "x-forwarded-host": request.headers.host ?? authority,
    "x-forwarded-proto": "https",
  };
}
```

#### 7.4 Antwortumschreibung

```ts
// Location: /settings  ->  /hermes/settings   (nur relative, nur nicht bereits praefixierte)
// Set-Cookie: Path=/    ->  Path=/hermes
```

Beides in kleinen, einzeln getesteten reinen Funktionen (`rewriteLocation`, `rewriteCookiePath`).
Absolute `Location`-Werte auf fremde Hosts werden **nicht** umgeschrieben, sondern unverändert
weitergereicht.

#### 7.5 WebSocket

Der Aufbau folgt `t3Proxy.ts:126` (`proxyWebSocket`), mit denselben Anpassungen:
`Host` auf `authority`, `x-forwarded-prefix` gesetzt, Pfad um das Präfix gekürzt.
Puffergrenze wie beim T3-Proxy (512 KiB in der Aufbauphase), Close-Code-Normalisierung
(1005/1006 → 1011) übernehmen.

Der Token-Query-Parameter von `/api/ws?token=…` darf **nicht** ins Log geraten:
im Proxy-Logger die Query aus der geloggten URL entfernen (`request.log`-Serializer oder
schlicht kein URL-Logging auf dieser Route).

#### 7.6 Weitere Anforderungen

1. Keine Route außerhalb des Präfixes.
2. Streaming-Antworten unverändert durchreichen (kein Puffern ganzer Antworten;
   `reply.from` streamt bereits).
3. Ist das Dashboard nicht erreichbar, liefert der Proxy **keine** rohe Fehlerseite, sondern
   Status 502 mit einem kurzen JSON — die Recovery-Oberfläche baut das Frontend
   (`HermesDisconnectedState`).
4. Die CSP der Workbench wird nicht global gelockert. `frameSrc` enthält bereits `'self'`;
   `/hermes/` ist same-origin.
5. `frameAncestors: ["'self'"]` bleibt — das Dashboard ist nur im Workbench-Origin einbettbar.

#### 7.7 Letzte Verwaltungsseite merken

Die Hermes-SPA meldet ihre interne Route nicht nach außen. Es gibt dafür keinen offiziellen
Mechanismus (geprüft: keine `postMessage`-Schnittstelle, kein Routen-Endpunkt).
Deshalb eine **minimale, versionierte Bridge**, die der Proxy nur in die HTML-Antwort von
`GET /hermes` bzw. `GET /hermes/<spa-route>` injiziert:

```js
(() => {
  const notify = () => window.parent.postMessage({
    source: "remote-workplace-hermes",
    version: 1,
    type: "route.changed",
    path: `${location.pathname}${location.search}${location.hash}`,
  }, location.origin);
  const wrap = (name) => {
    const original = history[name];
    history[name] = function (...args) { const r = original.apply(this, args); notify(); return r; };
  };
  wrap("pushState"); wrap("replaceState");
  addEventListener("popstate", notify);
  addEventListener("hashchange", notify);
  notify();
})();
```

Regeln:

- Injektion nur bei `Content-Type: text/html` und nur direkt vor `</head>`.
- Der Parent prüft `event.origin === window.location.origin`, `source`, `version` und dass
  `path` mit `/hermes` beginnt und keine `..`-Segmente enthält.
- Gespeichert wird der Pfad **lokal** (`localStorage`, Schlüssel
  `workbench:hermes:admin-path`) und zusätzlich im Panel-/Orbit-Knotenzustand.
- Standardpfad einer nie besuchten Verwaltung: `/hermes/` (Statusseite).
- Standardfläche des gesamten Werkzeugs bleibt `chat`.
- Fällt die Injektion aus (z. B. weil Hermes das HTML ändert), degradiert das Feature still
  auf „immer Startseite" — es bricht nichts.

---

### Phase 8: Automatische Updates

**Skript:** `scripts/hermes-update.sh`, `set -euo pipefail`, ohne `sudo`.
**Zustandsdatei:** `<paths.dataDir>/hermes/update-state.json`, `chmod 0600`, atomar geschrieben
(temporäre Datei + `rename`), Schema in `packages/contracts` gespiegelt.

```jsonc
{
  "phase": "idle",                 // idle | checking | pending | running | succeeded | failed
  "pending": false,
  "lastCheckedAt": "2026-08-01T02:15:00Z",
  "lastStartedAt": null,
  "lastFinishedAt": null,
  "lastResult": "none",            // success | failed | deferred | none
  "previousVersion": "0.14.0",
  "previousCommit": "…",
  "newVersion": null,
  "newCommit": null,
  "deferredSince": null,
  "lastFullBackupAt": "2026-07-27T02:15:00Z",
  "logTail": []                    // max. 40 Zeilen, redigiert
}
```

**Ablauf:**

```bash
acquire_lock            # flock auf <dataDir>/hermes/update.lock; belegt => exit 0
record_phase checking

current_commit=$(git -C "$CHECKOUT" rev-parse HEAD)
current_version=$(hermes version | head -1)

if ! hermes update --check | grep -qi "update available"; then
  record_no_update       # lastCheckedAt + lastResult=none, pending unveraendert
  exit 0
fi

if hermes_is_busy; then
  mark_pending           # phase=pending, deferredSince setzen (falls leer)
  notify "Update verschoben"  severity=info  # nur beim ERSTEN Verschieben
  exit 0
fi

record_phase running
weekly_full_backup_if_due     # hermes backup, hoechstens 1x/Woche
hermes update --yes --backup  # --backup erzwingt den Pre-Update-Snapshot
rebuild_dashboard_spa         # cd "$CHECKOUT/web" && npm ci && npm run build
systemctl --user restart hermes-dashboard.service
systemctl --user restart hermes-gateway.service
wait_healthy_dashboard        # HTTP /api/status, max. 120 s
wait_healthy_gateway          # systemctl is-active + /api/status
hermes doctor                 # Ausgabe redigiert in logTail
record_success                # Versionen vorher/nachher, Commits, Zeiten
clear_pending
notify "Hermes aktualisiert"  severity=success
```

**Busy-Erkennung** (nicht über Prozessnamen — das war eine ausdrückliche Schwäche in Fassung 1):

1. `GET /api/v1/hermes/tasks` der Workbench (kennt laufende ACP-Prompts direkt).
2. `GET /api/status` und `GET /api/sessions?limit=10` des Dashboards: Session mit
   `updatedAt` jünger als 5 Minuten und Status `running`.
3. `GET /api/cron/jobs`: ein Job mit `lastStatus: running` oder `nextRunAt` in < 10 Minuten.
4. Gateway-Zustand: ein laufender Telegram-Dialog (aus `gateway_state.json`).

Trifft eine der Bedingungen zu, gilt Hermes als beschäftigt.

**Fehlerpfad:**

- `record_failure` mit Phase, Exit-Code, letzten 40 Logzeilen (redigiert).
- Benachrichtigung `severity: error`, bleibt **unbestätigt** sichtbar.
- Dashboard und Gateway werden trotzdem neu gestartet, damit kein Dienst tot bleibt.
- Rollbackpfad in der Benachrichtigung und in `docs/troubleshooting.md`:
  ```bash
  git -C ~/.hermes/hermes-agent reset --hard <previousCommit>
  ~/.hermes/hermes-agent/venv/bin/pip install -e ~/.hermes/hermes-agent
  cd ~/.hermes/hermes-agent/web && npm ci && npm run build
  systemctl --user restart hermes-dashboard.service hermes-gateway.service
  # Alternativ vollstaendig: hermes import <backup>.zip
  ```

**Update aus der UI** (`POST /api/v1/hermes/update/run`) startet dasselbe Skript über
`systemctl --user start hermes-update.service` und setzt eine Umgebungsvariable
`HERMES_UPDATE_FORCE=1`, die die Busy-Prüfung überspringt — aber nur nach einer expliziten
Bestätigung im Dialog, die die laufenden Aufgaben auflistet.

**Nebenläufigkeit.** Der `flock` verhindert zwei parallele Läufe. Der Timer, der Retry-Timer
und die UI teilen sich dieselbe Sperre.

---

### Phase 9: Native Chat-Oberfläche

**Neues Verzeichnis:** `apps/web/src/components/hermes/`

```
HermesShell.tsx            Rahmen: Header + (Sidebar | Chat) oder Admin-Iframe
HermesHeader.tsx           Titel, Anbieter, Modell, Status, Stopptaste, Menü
HermesSessionSidebar.tsx   Liste, Suche, Neu, Quellen-Badges; mobil Drawer
HermesChat.tsx             Verbindungslogik + Nachrichtenfluss
HermesMessageList.tsx      Virtualisiert ab ~200 Nachrichten
HermesMessage.tsx          Markdown, Codeblöcke, Tabellen, Copy
HermesToolCallCard.tsx     Kompakt, aufklappbar
HermesTerminalCard.tsx     Befehl, cwd, Exit-Code, Ausgabe, Kürzungshinweis
HermesApprovalCard.tsx     Freigabe mit Ablaufanzeige
HermesComposer.tsx         Mehrzeilig, Entwurf, Stop, Safe-Area
HermesTaskStatus.tsx       Laufzeit, Modell, Abbruch
HermesModelMenu.tsx        Modellwahl aus /api/v1/hermes/models
HermesProjectBindingMenu.tsx  Ungebunden ↔ Projekt
HermesAdminFrame.tsx       Iframe auf /hermes + Bridge-Empfang
HermesDisconnectedState.tsx   Recovery mit Neustart/Diagnose/Logs
HermesDiagnosticsDialog.tsx   Diagnoseliste + Aktionen
useHermesChat.ts           WS-Client, Reconnect, Entwurf, Dedup
```

**Store:** `apps/web/src/stores/hermes.ts` (Zustand + `persist`) für Sidebar-Zustand,
Entwürfe je Session, zuletzt besuchte Verwaltungsseite und zuletzt aktive Session je Panel.

**Wiederverwendbarkeit.** `HermesShell` bekommt `instanceId`, `variant` (`route` | `panel` |
`orbit`) und `minimal`. Genau diese Komponente wird von Route, Workbench-Panel und
Orbit-Werkzeugknoten verwendet — kein zweiter Chat-Code.

#### 9.1 Sessionliste

Desktop `| Sessionliste | Chat |`; Standard sichtbar, einklappbar, Zustand persistiert.
Inhalt je Zeile: Titel, Quelle (Badge `Web` / `Telegram` / `Cron` / `CLI`), letzte Aktivität,
Modell, Status, Laufend-Markierung. Suche über `/api/v1/hermes/sessions?q=`.

- Schließen des Panels löscht **nie** eine Session.
- Löschen nur über eine explizite Aktion mit Bestätigungsdialog
  (`DELETE /api/v1/hermes/sessions/:id`).
- Mobil: Drawer mit Fokusfalle (`useModalFocus` existiert), Schließen per Escape und Backdrop,
  Zeilenhöhe ≥ 44 px, Composer-Entwurf bleibt erhalten.

#### 9.2 Nachrichten

Unterstützt: Benutzer, Assistent, System, Tool-Aufruf, Tool-Ergebnis, Terminalausgabe,
Streaming, Fehler, Freigaben, Rückfragen, Zwischenstände, Markdown, Codeblöcke mit Sprache,
Tabellen, Links, lange Ausgaben mit Collapse, Copy-Buttons, Session-Resume.

- Markdown-Rendering mit einer bereits im Projekt vorhandenen Lösung, sonst mit einer kleinen,
  bewusst begrenzten Umsetzung. **Kein** `dangerouslySetInnerHTML` ohne Sanitizer.
- `@assistant-ui/react` ist zulässig, aber erst nach Prüfung von Bundlegröße und
  Designanpassbarkeit. Standardempfehlung: eigene Komponenten, weil das Designsystem eng ist
  und der Funktionsumfang der Bibliothek größtenteils ungenutzt bliebe.
- Keine Electron-Abhängigkeiten.

#### 9.3 Composer

Mehrzeilig, Enter sendet, Shift+Enter erzeugt Zeilenumbruch, Senden-Button, Stop-Button bei
laufender Aufgabe, deaktiviert bei Verbindungsfehler mit Begründung, Entwurf je Session
erhalten, Projektbindung kompakt sichtbar, Safe-Area auf Mobil
(`padding-bottom: env(safe-area-inset-bottom)`), kein doppeltes Senden nach Reconnect
(`clientMessageId`), Slash-Befehl-Hinweise aus `commands.available`.

**Kein künstlicher Promptumbau** — der Text geht unverändert an den Server.

#### 9.4 Toolkarten

Kompakt: Name, Status, Laufzeit, kurze Zusammenfassung. Aufklappbar: Argumente, Ergebnis,
Fehler, Freigabestatus. Terminalkarte zusätzlich: Befehl, Arbeitsverzeichnis, Exit-Code,
Ausgabe, Hinweis bei abgeschnittener Ausgabe.

#### 9.5 Freigaben

Deutliche Beschreibung, betroffenes Tool und Befehl, Risikohinweis, Buttons `Ablehnen` und
`Einmal erlauben` (und `Für diese Session erlauben`, **nur** wenn Hermes die Option meldet).
`Immer erlauben` wird **nicht** angeboten — es würde dauerhaft in `command_allowlist`
schreiben und der Anforderung „keine pauschale Dauerfreigabe" widersprechen.
Antwort ist an `sessionId` + `requestId` gebunden; eine zweite Antwort wird verworfen.
Ablaufanzeige gemäß `expiresAt`; nach Ablauf wird die Karte inaktiv mit Hinweis.

#### 9.6 Route und Panel

- `apps/web/src/views/HermesRoute.tsx` — Standalone-Seite, Muster `ToolRoute.tsx`.
- `apps/web/src/lib/routeModules.ts`: `hermes: () => import("../views/HermesRoute")`,
  Export `loadHermes`, Eintrag in `pathLoaders` (`["/hermes-agent", loadHermes]`).
- `apps/web/src/App.tsx`: `const HermesAgent = lazy(...)` und
  `<Route path="hermes-agent" element={<DeferredRoute><HermesAgent /></DeferredRoute>} />`.
  Der `PersistentOutlet` hält die Route danach automatisch gemountet.
- `apps/web/src/routes/routeDefinitions.ts`:
  `{ id: "hermes-agent", path: "/hermes-agent", requiresProject: false }`.
- `apps/web/src/routes/navigation.ts`: neuer Eintrag in `toolRouteItems`
  **an Position 2, direkt nach T3 Code**:
  ```ts
  { to: "/hermes-agent", label: "Hermes Agent", description: "Agent, Automatisierungen und Serververwaltung", icon: HermesIcon },
  ```

---

### Phase 10: Workbench-Integration

1. **`apps/web/src/components/ToolPanel.tsx`**
   - `panelTitles.hermes = "Hermes Agent"`.
   - `resolvePanel`: `hermes` verhält sich wie `terminal`/`browser`/`files` —
     `{ url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" }`.
   - Im Renderzweig vor `showPreviewStart`:
     ```tsx
     ) : panel.type === "hermes" ? (
       <HermesShell instanceId={panel.id} variant="panel" minimal={minimal} panel={panel} />
     ) : …
     ```
   - `StateDot`-Bedingung (Z. 270) um `"hermes"` erweitern.
   - `HermesShell` wird **lazy** importiert, damit der Hermes-Code nicht im
     Haupt-Bundle des ToolPanels landet.
2. **`apps/web/src/stores/workspace.ts`**
   - `isSamePanel` muss zwei Hermes-Panels anhand der `id` unterscheiden, damit mehrere
     Instanzen möglich sind (wie Terminal/Codex).
   - `makePanel` setzt für `hermes` die Defaults `hermesSurface: "chat"`,
     `hermesSessionId: null`, `hermesAdminPath: "/"`, `hermesSidebarCollapsed: false`.
   - Neue Aktion `updateHermesPanel(panelId, patch)` zum Persistieren von Session, Fläche,
     Verwaltungspfad und Sidebar-Zustand.
   - Die **zweite Schemakopie** in `parseStoredWorkspace` (v2-Migration) mitziehen.
3. **Werkzeugleiste / mobiles Werkzeugmenü**
   - Hermes-Button ist **nicht** projektabhängig deaktiviert.
   - Er zählt gegen `WORKBENCH_LIMITS.maxResidentTools` (10).
   - Mehrere Instanzen erlaubt.
   - Eine neue Instanz startet **ohne** Session; die ACP-Session entsteht erst beim ersten
     Senden — so bleiben keine leeren Sessions in `state.db` zurück.
4. **Panel-Icon** in der Werkzeugauswahl: `HermesIcon`.
5. **Tests:** `apps/web/src/components/ToolPanel.test.ts` und
   `apps/web/src/stores/workspace.test.ts` um Hermes-Fälle erweitern (Öffnen, Limit,
   Persistenz, Migration eines v2-Dokuments ohne Hermes-Felder).

---

### Phase 11: Orbit-Integration

#### 11.1 Chat-Knoten — ohne neuen Knotentyp

`OrbitNodeView.tsx:177` (`ToolNode`) rendert bereits `<ToolPanel>` mit
`panel.type = node.toolType`. Sobald `"hermes"` in `panelTypeSchema` steht, funktioniert ein
Hermes-Chat-Knoten als `{ type: "tool", toolType: "hermes" }` **ohne weitere Änderung**:
Verschieben, Skalieren, Maximieren, Zustandserhalt und Projektbindung sind vorhanden.

Nötig ist nur:

- `toolLabels.hermes = "Hermes Agent"` (in `OrbitNodeView.tsx`).
- Palette-Eintrag in `commandPayloads` (`OrbitWorkbench.tsx:236`):
  ```ts
  { keywords: "hermes agent chat assistent", payload: { type: "tool", title: "Hermes Agent", toolType: "hermes" } },
  ```
- Größere Standardgröße als bei anderen Werkzeugen (Vorschlag 720 × 560).

Die Session-ID des Knotens wird im vorhandenen `runtimeId`-Feld geführt — genau dafür ist es
da (`panel.id = node.runtimeId ?? node.id`).

#### 11.2 Vier neue Datenknoten

| Typ | Inhalt | Standardgröße | Datenquelle |
|---|---|---|---|
| `hermesStatus` | Version, Anbieter, Modell, Dashboard, Gateway, Telegram, letzter Healthcheck, verfügbares Update, letztes Updateergebnis | 320 × 260 | `GET /api/v1/hermes/status` |
| `hermesTasks` | Laufende Sessions/Jobs mit Quelle, Laufzeit, Modell, Titel, Stopptaste, Öffnen-Link | 380 × 300 | `GET /api/v1/hermes/tasks` |
| `hermesCron` | Aktive Cronjobs, nächster Lauf, letzter Lauf, letzter Status, Link in die offizielle Cron-Verwaltung | 380 × 320 | `GET /api/v1/hermes/cron` |
| `hermesResults` | Erfolge/Fehler mit Quelle, Zeit, Vorschau, Link, Gelesen-Status, Filter | 400 × 380 | `GET /api/v1/hermes/results` |

Rendering in `OrbitNodeView.tsx` über `NodeChrome` (wie `UsageNode`), Palette-Einträge in
`commandPayloads`, Farbe in `minimapNodeColor` (Vorschlag `#719b77`, die vorhandene
Pastellgrün-Familie), Projektzuweisung im Inspektor für diese Typen ausblenden (Z. 358,
Muster `usage`/`frame`).

#### 11.3 Datenaktualisierung

**Keine Polling-Schleife pro Knoten.** Gemeinsame TanStack-Query-Keys in
`apps/web/src/lib/queryOptions.ts`:

```ts
hermesStatus:  () => ({ queryKey: ["hermes", "status"],  refetchInterval: 30_000 }),
hermesTasks:   () => ({ queryKey: ["hermes", "tasks"],   refetchInterval: 6_000 }),
hermesCron:    () => ({ queryKey: ["hermes", "cron"],    refetchInterval: 60_000 }),
hermesResults: () => ({ queryKey: ["hermes", "results"], refetchInterval: 20_000 }),
```

Zehn Statusknoten teilen sich damit **eine** Anfrage. Im Hintergrundtab wird das Intervall
über `refetchIntervalInBackground: false` ausgesetzt. Fehler führen zu einem klaren
Offline-Zustand im Knoten, nicht zu einer leeren Karte.

#### 11.4 Mobil

Orbit hat eine eigene mobile Darstellung (`tests/e2e/orbit-mobile.spec.ts`). Die neuen Knoten
müssen dort erreichbar und lesbar sein; der Chat-Knoten fällt auf die vorhandene mobile
Werkzeugdarstellung zurück.

---

### Phase 12: Benachrichtigungen

Das generische Benachrichtigungssystem ist umgesetzt. Einträge werden in SQLite
gespeichert und nach einer Aufbewahrungsfrist bereinigt. Der Contract enthält Quelle,
Kategorie, Icon, Schweregrad, Zustand, Lese- und Bestätigungszeitpunkte, Link, Metadaten
und optionale redigierte Fehlerberichte. Deduplizierung erfolgt über Quelle, Art und
Remote-ID.

Die API unterstützt Filtern, Cursor-Paginierung, Lesen, Bestätigen, Presence, Push-Abos
und einen WebSocket für Änderungen. Die Oberfläche hält ihre Abfrage über diesen Kanal
aktuell. Push lässt sich serverweit, pro Quelle und pro Gerät steuern. Kurzlebige
Toast-Oberflächen und zugehörige Einstellungen sind entfernt; es gibt keinen Popup-Ersatz.

---

### Phase 13: Sicherheit und Approvals

#### 13.1 Netzwerk und Zugriff

Siehe [Phase 4](#phase-4-sicherheit-des-zugangswegs-vorgezogen). Zusammengefasst:
Loopback-Bindung, kein Tailscale-Serve/Funnel für 9119, Zugriff nur über den Proxy,
`/hermes` in `protectedPrefixes`, Origin-Prüfung bei WS, korrektes `Host`-Verhalten,
keine CORS-Wildcards.

#### 13.2 Dateizugriff

Hermes darf als Workbench-Benutzer arbeiten: Projekte lesen und schreiben, das Remote-Workplace-
Repository bearbeiten, Terminalwerkzeuge nutzen, Cronjobs ausführen, Recherchewerkzeuge nutzen.

Hermes soll **nicht**: pauschal als Root laufen, beliebige passwortlose `sudo`-Befehle
ausführen, Systemdienste ohne kontrollierte Schnittstelle ändern, Secrets in Logs oder
UI-Vorschauen ausgeben.

#### 13.3 Approvals — konkreter Zielzustand

`approvals.mode` kennt `ask`, `yolo`, `deny` (Altwert `manual` im aktuellen Config).
Es gibt **keinen** intelligenten Modus. Normale Dateiänderungen lösen ohnehin keine Freigabe
aus — nur Treffer der `DANGEROUS_PATTERNS`.

**Zielkonfiguration:**

```yaml
approvals:
  mode: ask
  timeout: 60
  cron_mode: deny        # unveraendert: Cronjobs duerfen nichts Gefaehrliches ohne Aufsicht
  mcp_reload_confirm: true
  destructive_slash_confirm: true   # aktuell false
```

**Der wichtigste Einzelbefund dieser Phase.** `command_allowlist` enthält aktuell dauerhaft
freigegebene Muster:

```
script execution via -e/-c flag
sudo with privilege flag (stdin/askpass/shell/list)
delete in root path
recursive delete
overwrite project env/config via redirection
```

Diese Einträge stammen aus früheren „Immer erlauben"-Antworten und heben die Freigabepflicht
für genau die Aktionen auf, die laut Anforderung bestätigt werden müssen — inklusive `sudo`
und rekursivem Löschen. Auf einem Server mit `NOPASSWD: ALL` ist das faktisch unbegrenzter
Rootzugriff ohne Rückfrage.

**Vorgehen (bewusst nicht stillschweigend):**

1. Der Installationslauf zeigt die aktuelle Liste an und schlägt die Entfernung aller fünf
   Einträge vor.
2. Standard des Skripts ist das Entfernen; `--keep-allowlist` behält sie.
3. Vorher/Nachher wird in den Implementierungsbericht geschrieben.
4. `docs/security-exceptions.md` bekommt einen Abschnitt, der den Befund und die Entscheidung
   festhält.
5. Die UI bietet dauerhaft nur `Ablehnen`, `Einmal erlauben` und — falls von Hermes gemeldet —
   `Für diese Session erlauben`. Kein `Immer erlauben`.

Telegram-Verhalten bleibt kompatibel: `mode: ask` gilt gleichermaßen und ist dort der bisherige
Zustand.

---

### Phase 14: Theme und Icon

#### 14.1 Icon

Quelle: `~/.hermes/hermes-agent/acp_registry/icon.svg` (MIT © 2025 Nous Research).

Umsetzung als `HermesIcon` in `apps/web/src/components/icons/WorkbenchIcons.tsx`:

- Geometrie unverändert übernehmen, `viewBox` von `0 0 16 16` auf `0 0 24 24` skalieren
  (Faktor 1,5) oder den 16er-`viewBox` an `IconSvg` durchreichen — Letzteres ist einfacher und
  verlustfrei: `<IconSvg viewBox="0 0 16 16" …>`.
- Farben an das vorhandene System anpassen: die Icons der Workbench nutzen `var(--icon-*)`,
  nicht `currentColor`. Stäbe und Flügel auf `var(--icon-green, #4bb38b)`, Mittelachse auf
  `var(--icon-text, #e8e8e8)`, Kugel auf `var(--icon-green)`.
- Strichstärken proportional an die übrigen Icons angleichen (dort 1,6–1,8 bei 24er-Box).
- **Dieselbe** Komponente in Sidebar, Mobile-Nav, Workbench-Werkzeugleiste, Orbit-Palette,
  Statusknoten und leeren Zuständen.
- Lizenzhinweis in `docs/architecture.md` und im Dateikopf der Icon-Datei.

#### 14.2 Dashboard-Theme

**Datei im Repo:** `deploy/hermes/dashboard-themes/remote-workplace.yaml`
**Installationsziel:** `$HERMES_HOME/dashboard-themes/remote-workplace.yaml`

Das Theme liegt damit **außerhalb** des Checkouts und übersteht jedes `hermes update`
unbeschadet. Der Hermes-Quellbaum wird **nie** bei einem Workbench-Start verändert.

```yaml
name: remote-workplace
description: Remote Workplace — dunkel, ruhig, Pastellgruen
palette:
  background: "#0a0a0a"     # ink-950
  midground:  "#171717"     # ink-900
  foreground: "#e8e8e8"
  warmGlow: "rgba(0,0,0,0)" # kein Glow
  noiseOpacity: 0
typography:
  fontSans:  <Wert aus dem Designsystem der Workbench>
  fontMono:  <Wert aus dem Designsystem der Workbench>
  baseSize:  "14px"
  lineHeight: "1.55"
layout:
  radius: "8px"
  density: compact
colorOverrides:
  card: "#171717"
  cardForeground: "#e8e8e8"
  popover: "#1f1f1f"
  popoverForeground: "#e8e8e8"
  primary: "#719b77"         # dunkles Pastellgruen
  primaryForeground: "#0a0a0a"
  secondary: "#262626"
  secondaryForeground: "#e8e8e8"
  muted: "#262626"
  mutedForeground: "#9a9a9a"
  accent: "#719b77"
  accentForeground: "#0a0a0a"
  destructive: "#cf7478"
  destructiveForeground: "#0a0a0a"
  success: "#4bb38b"
  warning: "#d4a940"
  border: "#2b2b2b"
  input: "#1f1f1f"
  ring: "#719b77"
components:
  card:   { borderRadius: "8px", boxShadow: "none" }
  header: { borderBottom: "1px solid #2b2b2b", backdropFilter: "none" }
  backdrop: { background: "#0a0a0a" }
customCSS: |
  /* Nur, was ueber die Token nicht erreichbar ist. Hart begrenzt auf 32 KiB. */
```

Die konkreten Hex-Werte werden **aus den vorhandenen CSS-Variablen der Workbench abgelesen**,
nicht erfunden. Die Werte oben sind die im Code gefundenen Icon-/Flächenfarben und dienen als
Ausgangspunkt.

Aktivierung: `dashboard.theme: remote-workplace` in `~/.hermes/config.yaml` oder
`PUT /api/dashboard/theme`. Nach einem Hermes-Update prüft der Update-Lauf, ob das Theme noch
gelesen wird (`GET /api/dashboard/themes` enthält `remote-workplace`), und meldet sonst eine
Warnung.

**Direkte CSS-Injektion** ist nur zulässig, wenn eine konkrete Anforderung über `customCSS`
und die Token nachweislich nicht erreichbar ist — dann klein, kommentiert und versioniert.

---

### Phase 15: Diagnose und Fehlerzustände

#### 15.1 Diagnoseansicht

`GET /api/v1/hermes/diagnostics` liefert eine Liste geprüfter Punkte mit
`{ id, label, status: "ok"|"warn"|"fail"|"skipped", detail, hint }`:

| # | Prüfpunkt | Quelle |
|---|---|---|
| 1 | Hermes-CLI gefunden | Dateisystem |
| 2 | Hermes-Version und Commit | `/api/status`, `git rev-parse` |
| 3 | Checkout und Git-Zustand sauber | `git status --short` |
| 4 | `HERMES_HOME` erkannt und beschreibbar | Dateisystem |
| 5 | Dashboard-Unit aktiv | `systemctl --user show` |
| 6 | Dashboard-HTTP erreichbar | `GET /api/status` |
| 7 | Dashboard-SPA gebaut | `hermes_cli/web_dist/index.html` |
| 8 | Session-Token abrufbar | `token.ts` |
| 9 | Proxy-Präfix funktioniert | interner `GET /hermes/` mit Prefix-Header |
| 10 | Cookie- und Redirect-Umschreibung | interner Testaufruf |
| 11 | Chat-Transport (ACP) | `hermes acp --check` |
| 12 | ACP-Prozess läuft | Manager-Zustand |
| 13 | Gateway-Unit aktiv | `systemctl --user show` |
| 14 | Telegram verbunden | `/api/status` |
| 15 | Anbieter und Modell gesetzt | `/api/model/info` |
| 16 | Sessions-Datenbank erreichbar | `/api/sessions?limit=1` |
| 17 | Cron-Scheduler erreichbar | `/api/cron/jobs` |
| 18 | Skills erreichbar | `/api/skills` |
| 19 | Update-Zustand | Zustandsdatei |
| 20 | Letzte Update-Logs | Zustandsdatei (redigiert) |
| 21 | `hermes doctor` | CLI (redigiert) |
| 22 | Ergebnis-Synchronisierung aktuell | Cursor-Alter |
| 23 | Approval-Konfiguration | `approvals.mode`, `command_allowlist`-Größe |

Aktionen im Dialog: Diagnose neu ausführen · Dashboard neu starten · Gateway neu starten ·
Update prüfen · Logs öffnen · Fehlerdetails kopieren (redigiert).

**Redigierung ist Pflicht.** Jede Ausgabe läuft durch dieselbe Funktion wie im HTTP-Client.

#### 15.2 Fehlerzustände

Jeder Zustand hat Text, Ursache und **eine sinnvolle nächste Aktion**:

| Zustand | Nächste Aktion |
|---|---|
| Hermes deaktiviert (`enabled: false`) | Hinweis auf `config/workbench.local.json` |
| Hermes nicht installiert / CLI nicht gefunden | Installationsanleitung, Diagnose |
| Dashboard gestoppt | `Starten`, `Diagnose` |
| Dashboard startet | Spinner, Health-Polling, Abbruch nach `startTimeoutSeconds` |
| Dashboard nicht erreichbar | `Neu starten`, `Diagnose öffnen`, `Logs anzeigen` |
| Dashboard-SPA nicht gebaut | `Dashboard neu bauen` (startet den Build-Schritt) |
| Gateway gestoppt | `Gateway starten` |
| Telegram getrennt | `Gateway neu starten`, Logs |
| Chat-Transport nicht unterstützt | Diagnose, Verwaltung bleibt nutzbar |
| ACP abgestürzt | automatischer Neustart, Hinweis, `Erneut versuchen` |
| WebSocket getrennt | automatischer Reconnect mit Backoff + Statusanzeige |
| Session nicht gefunden | `Neue Session starten` |
| Session beschäftigt | Stopptaste hervorheben |
| Update läuft | Fortschritt, Aktionen gesperrt |
| Update fehlgeschlagen | dauerhafte Benachrichtigung, Rollbackanleitung |
| Modell nicht konfiguriert | `Modell wählen` (öffnet Verwaltung) |
| Anbieterfehler | Fehlertext, `Verwaltung öffnen` |
| Freigabe abgelaufen | Hinweis, erneut ausführen lassen |
| Projekt nicht mehr vorhanden | Bindung lösen, ungebunden fortfahren |
| Verwaltung nicht einbettbar | `In neuem Tab öffnen`, Diagnose |
| Proxy-Präfix-Fehler | Diagnosepunkt 9 hervorheben |
| Version inkompatibel | Meldung mit erwarteter und gefundener Version |

Beispiel für die Recovery-Fläche:

```
Hermes Dashboard ist nicht erreichbar.
Der Dienst hermes-dashboard.service ist gestoppt.

[Neu starten]  [Diagnose öffnen]  [Logs anzeigen]
```

---

### Phase 16: Performance

1. Keine Hermes-Desktop-App, kein versteckter Electron-Prozess, kein Chromium-Streaming.
2. Nativer Chat direkt über WebSocket; Verwaltung nur als Iframe.
3. Hermes-Route und `HermesShell` lazy geladen.
4. Das Verwaltungs-Iframe wird **erst beim ersten Öffnen** montiert und danach im
   `PersistentOutlet`/Panel gehalten — nicht bei jedem Flächenwechsel neu erstellt.
5. Sessionliste virtualisiert bzw. paginiert ab 100 Einträgen.
6. Lange Tool-Ausgaben serverseitig auf 8 KiB gekürzt mit Hinweis; die volle Ausgabe ist
   über die Verwaltung erreichbar.
7. Gemeinsamer Query-Cache; **keine** Polling-Schleife je Panel oder Knoten.
8. Reconnect mit exponentiellem Backoff und Jitter.
9. Keine unnötige Sessionanlage (siehe [Phase 10](#phase-10-workbench-integration), Punkt 3).
10. Geparkte Panels rendern nicht ständig neu — `React.memo` an den Listenkomponenten,
    Delta-Bündelung im Server.
11. Bundlegröße prüfen: Der Hermes-Chunk soll unter 120 KiB gzip bleiben. Markdown-Renderer
    und ggf. Virtualisierung in denselben Chunk.
12. Keine direkten Importe aus dem Hermes-Checkout.

---

## 6. Tests

### 6.1 Unit-Tests (Vitest)

| Bereich | Datei | Fälle |
|---|---|---|
| Config | `apps/server/src/config/workbench-config.test.ts` | fehlender Block, Loopback-Zwang, Portkollision, Präfixform |
| Proxy-Pfad | `apps/server/src/hermes/dashboard-proxy.test.ts` | `/hermes` → `/`, `/hermes/x?y` → `/x?y`, fremder Pfad unverändert |
| Proxy-Header | dito | `host` = Upstream-Authority (**nicht** Workbench-Host), `x-forwarded-prefix` gesetzt |
| Redirect/Cookie | dito | `Location: /a` → `/hermes/a`, absolute fremde URL unverändert, `Path=/` → `Path=/hermes` |
| Token | `apps/server/src/hermes/token.test.ts` | Scrape aus HTML, Cache, Invalidierung bei 401, genau ein Retry |
| Client | `apps/server/src/hermes/client.test.ts` | Timeout, Größenlimit, Redigierung, Fehlernormalisierung |
| ACP-Normalisierung | `apps/server/src/hermes/acp/normalize.test.ts` | Chunks, Tool-Updates, Freigaben, Nutzung, Fehler |
| ACP-Manager | `apps/server/src/hermes/acp/Manager.test.ts` | Start, Absturz + Backoff, Sessionlimit, doppelte Freigabeantwort, Ablauf |
| Chat-Brücke | `apps/server/src/hermes/chat-bridge.test.ts` | Origin/Identität, ungültige Nachricht, `clientMessageId`-Dedup, Fächern |
| Service-Control | `apps/server/src/hermes/service-control.test.ts` | Enum-Validierung, kein Unitname aus der Anfrage, Statusparser |
| Update-Zustand | `apps/server/src/hermes/update-service.test.ts` | Zustandsmaschine idle→checking→pending→running→succeeded/failed, Lock |
| Busy-Erkennung | dito | jede der vier Bedingungen einzeln |
| Benachrichtigungen | `apps/server/src/notifications/database.test.ts` | Dedup über `remote_id`, Zähler, Pagination, Aufräumen |
| Ergebnis-Poller | `apps/server/src/hermes/result-sync.test.ts` | Erstlauf meldet nichts, Cursor überlebt Neustart, Quellenzuordnung |
| Identität | `apps/server/src/security/workbench-identity.test.ts` | `/hermes` ist geschützt |
| Panel-Persistenz | `apps/web/src/stores/workspace.test.ts` | Hermes-Panel, Limit, v2-Migration |
| Orbit-Schema | `packages/contracts/src/index.test.ts` | v6/v7 lädt, v8 schreibt, neue Knotentypen, Defaults |
| Projektbindung | `apps/server/src/hermes/acp/Manager.test.ts` | `projectId` → validierter Pfad, außerhalb der Roots abgelehnt |
| Letzter Adminpfad | `apps/web/src/stores/hermes.test.ts` | Origin-Prüfung, `..` abgelehnt, Persistenz |

### 6.2 Integrationstests

Ein **Fake-Hermes** unter Loopback (Fastify oder `node:http` im Test), der die relevanten
Endpunkte und Verhaltensweisen nachbildet — inklusive:

- Host-Header-Prüfung (400 bei fremdem Host) — verifiziert die wichtigste Proxy-Eigenschaft.
- Session-Token in `index.html` + 401 ohne Header.
- `X-Forwarded-Prefix`-abhängige HTML-/CSS-Umschreibung.
- WebSocket auf `/api/ws` mit Token-Query.
- Streaming-Antwort (chunked).

Szenarien: Assets über den Proxy, Redirect, Cookie, WebSocket, Chat-Streaming, Tool-Ereignisse,
Freigabe (annehmen/ablehnen/ablaufen), Abbruch, Session-Resume, Update-Check, Update-Verschiebung
bei Beschäftigung, Benachrichtigungs-Synchronisierung, Telegram-Quellennormalisierung,
Cron-Ergebnis-Normalisierung, Eingabevalidierung der Dienststeuerung.

Für ACP zusätzlich ein **Fake-ACP-Prozess** (kleines Node-Skript, das JSON-RPC über stdio
spricht), damit der Manager ohne installiertes Hermes testbar bleibt.

### 6.3 E2E (Playwright)

Bestehende Infrastruktur nutzen (`tests/e2e/helpers/environment.ts`, `apiIdentityHeaders`,
`hasPrivateWorkbench` zum Überspringen ohne eingerichtete Instanz).
Neue Datei: `tests/e2e/hermes.spec.ts` (+ `hermes-mobile.spec.ts`).

**Desktop (1440 × 900)**

1. Sidebar zeigt `Hermes Agent` direkt unter `T3 Code`.
2. Klick öffnet den Chat (nicht die Verwaltung).
3. Sessionliste ist sichtbar.
4. Sessionliste lässt sich ein- und ausklappen, Zustand überlebt einen Routenwechsel.
5. Neue Session anlegen.
6. Nachricht senden.
7. Streaming-Antwort erscheint schrittweise.
8. Toolkarte erscheint und lässt sich aufklappen.
9. Stopptaste ist während des Laufs sichtbar und bricht ab.
10. Verwaltung öffnen — die offizielle Hermes-Navigation ist vollständig sichtbar.
11. In der Verwaltung zu Cron wechseln.
12. Route wechseln und Hermes erneut öffnen — die Cron-Seite ist wiederhergestellt.
13. Zwei Hermes-Panels in der Workbench mit unterschiedlichen Sessions.
14. Panel schließen — die Session ist in der Liste weiterhin vorhanden.
15. Projekt optional verbinden; danach steht `Ungebunden` nicht mehr im Header.
16. Benachrichtigungsglocke öffnen, Eintrag anklicken, Ziel-Session öffnet sich.
17. Diagnose öffnen und ausführen.
18. Orbit: Chat-, Status-, Aufgaben-, Cron- und Ergebnisknoten erzeugen und wiederfinden.

**Tablet (1024 × 768 quer, 768 × 1024 hoch)**

Sessionliste links im Querformat, eingeklappt im Hochformat, Drawer bedienbar, Composer
erreichbar, Verwaltung ohne horizontalen Überlauf, Workbench-Panel und Orbit-Knoten nutzbar.

**Smartphone (390 × 844)**

Navigation, Chat, Session-Drawer, Senden, Stoppen, Freigabe, Toolkarte, Drei-Punkte-Menü,
Verwaltungs-Iframe, Benachrichtigungen, alternative Orbit-Ansicht, virtuelle Tastatur
(Composer bleibt sichtbar).

**Regression:** `tests/e2e/release-smoke.spec.ts`, `sidebar.spec.ts`, `workbench-ui.spec.ts`,
`responsive-shell.spec.ts` und `orbit-ui.spec.ts` müssen unverändert grün bleiben.
`sidebar.spec.ts` prüft womöglich die Anzahl der Navigationseinträge — das ist bewusst
mitzuziehen.

### 6.4 Browser-Verifikation mit dem Playwright-MCP — verbindlich

**Jede sichtbare Änderung dieser Integration wird im echten Browser über den headless
`playwright`-MCP-Server geprüft.** Ein grüner `pnpm test:e2e`-Lauf ersetzt das nicht, und
`curl` oder ein API-Smoke-Test erst recht nicht. Die Regel steht so bereits in `AGENTS.md`
und in den globalen Arbeitsregeln; sie gilt hier ohne Ausnahme.

**Warum nicht die `preview_*`-Werkzeuge.** Die T3-eigenen `preview_*`-Tools brauchen einen
verfügbaren Automation-Host der Desktop-App. In Web-, TUI- und headless-Umgebungen scheitern
sie mit `PreviewAutomationNoAvailableHostError`. Das ist **kein** Grund, auf die
Browser-Verifikation zu verzichten, sondern das Signal, auf den `playwright`-MCP zu wechseln.
Ist auch der nicht verfügbar, wird das als eigenes MCP-Problem gemeldet, und die Phase gilt
als **nicht** abgeschlossen.

**Ablauf je Prüfung.**

1. `browser_navigate` auf `http://127.0.0.1:3010/workbench/hermes-agent`
   (lokale Dienste immer über `127.0.0.1` oder `localhost`, nie über den Tailscale-Namen).
2. `browser_snapshot` für den Accessibility-Baum. Der Snapshot ist die primäre Grundlage,
   nicht der Screenshot: er zeigt Rollen, Namen und Zustände und deckt fehlende Labels,
   nicht erreichbare Schaltflächen und leere Zustände zuverlässiger auf als ein Bild.
3. Fokussierte Aktionen mit `browser_click`, `browser_type`, `browser_press`,
   `browser_scroll` für den jeweiligen Ablauf.
4. `browser_resize` für die drei Größenklassen: 1440 × 900 (Desktop), 1024 × 768 und
   768 × 1024 (Tablet quer und hoch), 390 × 844 (Smartphone).
5. Screenshot ablegen und den Pfad im Implementierungsbericht notieren.
6. Browser-Konsole auf Fehler prüfen. Eine rote Konsole ist ein Fehlschlag, auch wenn die
   Oberfläche richtig aussieht.

**Pflichtabläufe im Browser** (jeder mindestens einmal auf Desktop und einmal auf Smartphone):

| # | Ablauf | Worauf zu achten ist |
|---|---|---|
| 1 | Navigation öffnen | `Hermes Agent` steht direkt unter `T3 Code`, Icon sichtbar |
| 2 | Hermes öffnen | Chat erscheint, nicht die Verwaltung |
| 3 | Sessionliste ein- und ausklappen | Zustand überlebt einen Routenwechsel |
| 4 | Nachricht senden | Streaming läuft sichtbar, Composer bleibt bedienbar |
| 5 | Toolkarte aufklappen | Argumente und Ergebnis lesbar, kein Überlauf |
| 6 | Terminalkarte | Befehl, Arbeitsverzeichnis, Exit-Code sichtbar |
| 7 | Freigabe beantworten | Karte ist per Tastatur erreichbar, Ablaufanzeige läuft |
| 8 | Laufende Aufgabe stoppen | Stopptaste ohne Menü erreichbar, Abbruch wirkt |
| 9 | Verwaltung öffnen | Hermes-Navigation vollständig, Theme angewandt |
| 10 | In der Verwaltung zu Cron wechseln, Route verlassen, zurückkommen | Cron-Seite wiederhergestellt |
| 11 | Zweites Hermes-Panel in der Workbench | zwei getrennte Sessions, beide bedienbar |
| 12 | Panel schließen | Session bleibt in der Liste bestehen |
| 13 | Orbit: Chat-, Status-, Aufgaben-, Cron- und Ergebnisknoten anlegen | Knoten rendern, Daten laden |
| 14 | Benachrichtigungsglocke | Zähler stimmt, Eintrag springt ans Ziel |
| 15 | Diagnose ausführen | jeder Punkt hat einen verständlichen Zustand |
| 16 | Fehlerzustand erzwingen (Dashboard stoppen) | Recovery-Fläche mit den drei Aktionen erscheint |

**Design- und Layoutprüfung im selben Durchgang:** kein Glow, keine Gradients, keine gelbe
Hermes-Farbwelt, korrekte Pastellgrün-Akzentfarbe, keine unkontrollierten horizontalen
Überläufe, Touchziele mindestens 44 Pixel, Composer bleibt bei eingeblendeter virtueller
Tastatur sichtbar.

**Screenshot-Sammlung** für den Bericht: Desktop, Tablet quer, Tablet hoch, Smartphone, lange
Tool-Ausgabe, Fehlerzustand, Freigabe, laufende Aufgabe, leere Session, Verwaltung mit
angewandtem Theme.

**Abgrenzung.** Die Playwright-Spezifikationen aus [6.3](#63-e2e-playwright) sichern die
Abläufe dauerhaft in CI ab. Der `playwright`-MCP ist das Werkzeug, mit dem die Umsetzung
während der Arbeit tatsächlich am laufenden System angeschaut und beurteilt wird. Beides ist
verlangt, keins ersetzt das andere.

---

## 7. Verifikation auf dem Server

```bash
# 1. Build und statische Prüfungen
pnpm --filter @workbench/contracts build
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# 2. Units
node deploy/systemd/render-units.mjs
systemd-analyze verify deploy/systemd/generated/hermes-dashboard.service
systemd-analyze verify deploy/systemd/generated/hermes-update.service
systemd-analyze verify deploy/systemd/generated/hermes-update.timer
systemd-analyze verify deploy/systemd/generated/hermes-update-retry.timer
bash scripts/install-hermes.sh
systemctl --user daemon-reload
systemctl --user is-active hermes-dashboard.service hermes-gateway.service
systemctl --user list-timers 'hermes-*' --all

# 3. Dashboard direkt (Host-Header beachten!)
curl -s -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/api/status | head -c 400

# 4. Proxy über die Workbench
bash scripts/restart-all.sh
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'tailscale-user-login: <erlaubter-benutzer>' http://127.0.0.1:3010/hermes/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3010/hermes/api/config   # erwartet 401

# 5. Workbench-API
curl -s -H 'tailscale-user-login: <erlaubter-benutzer>' \
  http://127.0.0.1:3010/api/v1/hermes/status | head -c 400

# 6. E2E
pnpm test:e2e
```

Danach im echten Browser über den `playwright`-MCP prüfen (Ablauf und Pflichtszenarien in
[6.4](#64-browser-verifikation-mit-dem-playwright-mcp--verbindlich)). Diese Liste ist die
Kurzfassung, sie ersetzt den dortigen Durchgang nicht:

1. Chat sendet und streamt.
2. Toolkarte und Terminalkarte erscheinen.
3. Freigabe erscheint und lässt sich beantworten.
4. Stoppen funktioniert.
5. Telegram funktioniert weiter (Testnachricht) und die Session erscheint in derselben Liste.
6. Ein Cronjob läuft und erzeugt eine Benachrichtigung.
7. Updatecheck läuft (`systemctl --user start hermes-update.service`, Zustandsdatei prüfen).
8. Diagnose ist vollständig grün oder erklärt jeden gelben/roten Punkt.
9. `journalctl --user -u hermes-dashboard.service -n 100` ohne Fehler.
10. Browser-Konsole ohne Fehler.
11. **Keine Secrets** in Logs, Diagnose, Benachrichtigungen oder im Bericht.
12. Regression: T3 Code, Terminal, Code-Server, Codex, OpenCode, Browser, Previews,
    Dateimanager, Orbit, Tech TLDRs, Nutzung, Einstellungen.

---

## 8. Dokumentation, Changelog, Version

**Zu aktualisieren:**

| Datei | Inhalt |
|---|---|
| `AGENTS.md` | Neuer Abschnitt „Hermes Agent". **Korrektur** der Aussage „kein `sudo` verfügbar" auf „`sudo` ist vorhanden, wird aber bewusst nicht verwendet — alle Dienste sind User-Units". |
| `docs/architecture.md` | Prozess-/Netzwerkdiagramm um Dashboard, Proxy und ACP erweitern; Icon-Lizenz |
| `docs/configuration.md` | `hermes`-Block, Env-Variablen, Portregeln |
| `docs/installation.md` | `scripts/install-hermes.sh`, Node-Voraussetzung für den SPA-Build |
| `docs/troubleshooting.md` | Fehlerzustände aus Phase 15, Rollbackanleitung, Host-Header-Falle |
| `docs/security-exceptions.md` | Session-Token im Iframe-HTML, `command_allowlist`-Entscheidung, Verzicht auf `sudo` |
| `CHANGELOG.md` | Unter `[Unveröffentlicht]` je fünf Stichpunkte in `Erstellt` / `Verändert` |
| `package.json`, `apps/web/package.json`, `settings.ts` (`APP_VERSION`) | Minor-Bump `0.36.0` → `0.37.0` |

**Inhaltlich zu erklären:** wie der Chat-Transport funktioniert (ACP über stdio, Brücke,
internes Protokoll), wie das Dashboard eingebettet wird (Präfix, Host-Header, Session-Token),
wo Checkout und `HERMES_HOME` liegen und warum sie nicht verschoben werden, wie Updates laufen,
wie Gateway und Telegram erhalten bleiben, wie die Dienste gesteuert werden (nur
`systemctl --user`), wie die Projektbindung funktioniert, wie Freigaben funktionieren, wie
Diagnose und Rollback funktionieren.

**Nicht dokumentieren:** lokale Secrets, absolute private Pfade, Tokenwerte.

---

## 9. Rollback

**Vollständiger Rückbau der Integration (Workbench-Seite):**

```bash
systemctl --user disable --now hermes-dashboard.service hermes-update.timer hermes-update-retry.timer
rm -f ~/.config/systemd/user/hermes-{dashboard,update}.service ~/.config/systemd/user/hermes-update*.timer
systemctl --user daemon-reload
# hermes.enabled = false in config/workbench.local.json  -> Routen antworten HERMES_DISABLED
bash scripts/restart-all.sh
```

**Garantien, die im Code sicherzustellen sind:**

1. `hermes-gateway.service` bleibt unverändert — Telegram läuft weiter.
2. `~/.hermes` wird nie verschoben oder gelöscht; das Backup aus Phase 0 bleibt bestehen.
3. Die Orbit-Migration ist additiv: v8-Dokumente mit Hermes-Knoten bleiben lesbar; wird die
   Integration deaktiviert, rendern unbekannte Knoten einen neutralen Platzhalter statt die
   Arbeitsfläche unlesbar zu machen. **Die Orbit-Datei darf nie ungültig werden.**
4. Die `notifications`-Tabelle ist additiv; ein Rückbau lässt sie einfach stehen.
5. Die Workspace-Panels: ein `hermes`-Panel in einem gespeicherten `localStorage`-Dokument
   darf nach einem Rückbau nicht dazu führen, dass die gesamte Arbeitsfläche verworfen wird —
   `parseStoredWorkspace` filtert unbekannte Paneltypen heraus, statt `freshWorkspace()`
   zurückzugeben. **Das ist als Test zu belegen.**
6. Fehlgeschlagenes Hermes-Update: `git reset --hard <previousCommit>` + Reinstall + SPA-Build,
   oder `hermes import <backup>.zip`.

---

## 10. Akzeptanzkriterien und Definition of Done

### 10.1 Navigation und Design

1. `Hermes Agent` steht direkt unter `T3 Code`.
2. Das offizielle Hermes-Icon (Caduceus) wird verwendet, eingefärbt im Iconsystem.
3. Design entspricht Remote Workplace: kein Glow, keine Gradients, keine gelbe Farbwelt.
4. Desktop, Tablet (quer/hoch) und Smartphone funktionieren.

### 10.2 Chat

Klassische Chatoberfläche · Sessionliste · ein-/ausklappbar · mehrere Sessions · mehrere Panels ·
Streaming · Toolkarten · Terminalkarten · Rückfragen · Freigaben · Stopptaste ·
Projektbindung optional · standardmäßig ungebunden · **kein** TUI-Terminal.

### 10.3 Verwaltung

Vollständiges offizielles Dashboard eingebettet · komplette Hermes-Navigation sichtbar ·
API-Schlüssel, Cron, Sessions, Logs, Skills, MCP, Memory und Profile erreichbar ·
letzte Verwaltungsseite wird wiederhergestellt · Theme angewandt.

### 10.4 Integration

Telegram funktioniert weiter · Cron funktioniert weiter · Web und Telegram sehen denselben
Sessionbestand (`state.db`) · Ergebnisse werden synchronisiert · Benachrichtigungen bleiben erhalten ·
dauerhafter Benachrichtigungsbereich funktioniert · Ergebnis-Widget funktioniert ·
aktive Aufgaben werden angezeigt.

### 10.5 Orbit

Fünf Hermes-Flächen verfügbar (Chat als Werkzeugknoten, vier Datenknoten) · mehrere Knoten je
Typ · Status korrekt · aktive Aufgaben korrekt · Cron korrekt · Ergebnisse korrekt ·
Chat funktionsfähig · bestehende Boards unverändert lesbar.

### 10.6 Dienste

Dashboard start-/stopp-/neustartbar · Gateway start-/stopp-/neustartbar · Diagnose verfügbar ·
Port nur Loopback · **kein `sudo`, keine systemweite Unit, kein Root-Helper** ·
Dienststeuerung akzeptiert keine freien Unitnamen.

### 10.7 Updates

Täglicher Check um 04:15 `Europe/Berlin` (explizite Zone im Timer) · automatische Installation ·
keine Installation während aktiver Aufgaben · Retry bei Beschäftigung · Pre-Update-Snapshot ·
wöchentliches vollständiges Backup · SPA-Rebuild nach dem Update · Post-Update-Diagnose ·
dauerhafte Benachrichtigung · Fehler bleiben sichtbar · Version vorher/nachher sichtbar.

### 10.8 Qualität

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e` und
`systemd-analyze verify` erfolgreich · Browser-Verifikation über den `playwright`-MCP für alle
drei Größenklassen durchlaufen · keine neuen kritischen Sicherheitsprobleme ·
`/hermes` ist identitätsgeschützt · keine Secrets in Logs oder UI · keine Regression ·
Dokumentation vollständig.

### 10.9 Definition of Done

Beende den Arbeitslauf erst, wenn:

1. Der Code vollständig implementiert ist.
2. Alle Schema- und Datenmigrationen vorhanden und rückwärtskompatibel sind.
3. Alle Tests geschrieben und bestanden sind.
4. Der Produktionsbuild erfolgreich ist.
5. Die systemd-Units geprüft und installiert sind.
6. Dashboard und Gateway verifiziert laufen.
7. Die native Chatoberfläche verifiziert ist (echter Hermes, kein Mock).
8. Die offizielle Verwaltung verifiziert eingebettet ist.
9. Telegram- und Cron-Synchronisierung verifiziert sind.
10. Benachrichtigungen verifiziert sind.
11. Orbit verifiziert ist.
12. Desktop, Tablet und Smartphone im echten Browser über den `playwright`-MCP geprüft sind,
    alle Pflichtszenarien aus [6.4](#64-browser-verifikation-mit-dem-playwright-mcp--verbindlich)
    durchlaufen wurden und die Browser-Konsole dabei fehlerfrei blieb.
13. Die Dokumentation aktualisiert und `AGENTS.md` korrigiert ist.
14. `CHANGELOG.md` und die Version gepflegt sind.
15. Der Implementierungsbericht erstellt ist.

### 10.10 Implementierungsbericht

Datei: `plans/Hermes_integration_bericht.md`. Inhalt:

Umgesetzte Architektur · geänderte Bereiche und Dateien · neue Datenmodelle · neue
API-Endpunkte · neue Systemdienste · Migrationsablauf · Testergebnisse · Build-Ergebnis ·
E2E-Ergebnis · verifizierte Hermes-Version und Commit vorher/nachher · Gateway-Status ·
Telegram-Status · Update-Test · **Abweichungen von diesem Plan mit Begründung** ·
`command_allowlist` vorher/nachher · bekannte Einschränkungen · Rollbackanleitung ·
Screenshot-Pfade. **Ohne Secrets.**

---

## 11. Risiken und offene Verifikationspunkte

Diese Punkte sind während der Umsetzung aktiv zu klären. Für jeden ist ein Rückfallweg benannt,
damit kein Punkt den Lauf blockiert.

| # | Risiko / offene Frage | Prüfung | Rückfallweg |
|---|---|---|---|
| 1 | Kann ACP `session/load` eine **Telegram-/Cron-Session** laden, oder nur eigene? | Session-ID aus `/api/sessions` mit `source: telegram` an `session/load` geben | Fremdquellen-Sessions schreibgeschützt anzeigen (Transkript über `/api/sessions/{id}/messages`), Antworten nur in eigenen Sessions |
| 2 | Erscheinen ACP-Sessions in `/api/sessions` mit einer erkennbaren Quelle? | Testsession anlegen, Liste prüfen | Quelle serverseitig aus dem ACP-Manager ergänzen (die Workbench kennt ihre eigenen Sessions) |
| 3 | Meldet ACP genug Struktur für die Terminalkarte (Befehl, cwd, Exit-Code)? | `acp_adapter/tools.py` gegen echte Läufe prüfen | Terminalkarte fällt auf die generische Toolkarte zurück |
| 4 | Bleibt `X-Forwarded-Prefix` nach einem Hermes-Update erhalten? | Diagnosepunkt 9 nach jedem Update | Update-Lauf meldet Warnung; Verwaltung „in neuem Tab öffnen" bleibt nutzbar |
| 5 | Bricht ein Hermes-Update die SPA (Node-Version, npm-Fehler)? | Build-Schritt im Update-Lauf, Exit-Code prüfen | Update gilt als fehlgeschlagen, Benachrichtigung bleibt unbestätigt, Rollbackanleitung |
| 6 | `hermes update` beendet das Dashboard selbst | `Restart=always` in der Unit | systemd startet neu; der Update-Lauf startet zusätzlich explizit neu |
| 7 | Session-Token wechselt mitten in einem Anfragefluss | 401-Retry in `token.ts` | genau ein Retry, danach `DASHBOARD_UNREACHABLE` |
| 8 | Ein Prompt läuft, während der Server neu startet | ACP-Prozess ist Kind des Servers und stirbt mit | Beim nächsten Start wird die Session per `session/load` geladen; der Verlust eines laufenden Prompts ist zu dokumentieren |
| 9 | `approvals.timeout` (60 s) ist für interaktive Freigaben knapp | Freigabekarte zeigt Countdown | Wert bleibt unverändert (Telegram-Kompatibilität); UI erklärt den Ablauf und bietet Wiederholung |
| 10 | Bundle wächst über das Ziel | `pnpm build`, Chunk-Größen prüfen | Markdown-Renderer schlanker wählen, Virtualisierung nachladen |
| 11 | Rate-Limit-Budget durch die neuen Poller | Intervalle aus Phase 11.3, geteilte Query-Keys | Intervalle über `config` erhöhbar; `/api/v1/hermes/*` ggf. wie `/health` von der Zählung ausnehmen |
| 12 | `code-server.service` ist aktuell `bad` | Vor der Regressionsprüfung feststellen, ob das ein Vorschaden ist | Vorzustand im Bericht festhalten, nicht als neue Regression werten |
