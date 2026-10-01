# Implementierungsbericht: Hermes-Agent-Integration

Stand: 2026-08-02 UTC\
Projektversion: `0.37.0`

## Ergebnis

Die Hermes-Integration ist im Remote Workplace vollständig verdrahtet: nativer Chat über
ACP/stdin/stdout, offizielle Hermes-Verwaltung unter `/hermes`, gemeinsame Hermes-Datenbasis,
Status-/Session-/Aufgaben-/Cron-/Ergebnis-Adapter, Benachrichtigungen, Orbit-Flächen,
User-Units, Update-Lauf, Diagnose und Rollback-Dokumentation sind umgesetzt.

Der Produktionsdienst läuft wieder. Zum Abschluss waren `workbench.service`,
`hermes-dashboard.service` und `hermes-gateway.service` aktiv. Der Gateway-Zustand ist
`connected`; Telegram bleibt damit in Betrieb.

## Architektur und geänderte Bereiche

- `packages/contracts/src/index.ts`: Hermes-Status-, Session-, Aufgaben-, Ergebnis-, Cron-,
  Chat-, ACP-normalisierte Ereignis-, Update-, Benachrichtigungs- und Diagnoseverträge sowie
  Orbit-Dokumentversion 8.
- `apps/server/src/config/`: zentrale Hermes-Konfiguration, Env-Overrides, abgeleitete Pfade,
  Loopback-/Portvalidierung und Beispiele.
- `apps/server/src/security/`: `/hermes` ist in das bestehende Identitäts- und
  Same-Origin-Modell aufgenommen.
- `apps/server/src/hermes/`: typisierter Dashboard-Client, ephemeres Session-Token-Caching,
  Header-/Pfad-/Cookie-/HTML-Proxy, ACP-Manager, Session-/Status-/Update-/Service-Adapter,
  Diagnose, Ergebnis-Synchronisierung und REST-/WebSocket-Routen.
- `apps/server/src/notifications/`: generische SQLite-Persistenz mit Deduplication,
  Cursor-Pagination, Ungelesen-/Fehlerzähler, Aufräumen und REST-API.
- `apps/web/src/components/hermes/`: wiederverwendbare Shell für Route, Panel und Orbit mit
  Sessionliste, Streaming-Chat, Markdown, Tool-/Terminalkarten, Freigaben, Stoppen,
  Modellwahl, Projektbindung, Verwaltung-Iframe, Diagnose und Recovery-Zuständen.
- `apps/web/src/stores/hermes.ts` und `apps/web/src/stores/workspace.ts`: persistente
  UI-Zustände, Session-/Panelbindung, Admin-Pfad und additive Rückwärtskompatibilität.
- Navigation, `ToolPanel`, Routen-Lazy-Loader, Mobile-Navigation, Workbench-Werkzeugauswahl
  und `OrbitNodeView.tsx`: Hermes steht direkt unter T3 Code und ist mehrfach instanzierbar.
- Orbit: Hermes Chat als vorhandener Werkzeugknoten sowie `hermesStatus`, `hermesTasks`,
  `hermesCron` und `hermesResults` mit gemeinsamem Query-Cache.
- `deploy/hermes/dashboard-themes/remote-workplace.yaml`: offizielles Hermes-Theme außerhalb
  des veränderlichen Hermes-Checkouts.
- `scripts/install-hermes.sh`, `scripts/hermes-update.sh` und
  `scripts/hermes-update-state.mjs`: idempotente Installation, Backup, Update, SPA-Build,
  Zustandsautomat, Locking, Retry und redigierte Fehlerlogs.
- `deploy/systemd/units/`: Dashboard-, Update- und Retry-Units als User-Units.

## Daten, Migrationen und gemeinsamer Bestand

- Hermes verwendet weiterhin ausschließlich `~/.hermes/state.db`; es gibt keine zweite
  Workbench-Datenbank für Hermes-Sessions.
- Telegram, Cron, Web-ACP und der native Chat erscheinen damit in derselben Sessionliste.
- Workbench-Panels erhalten nur flache optionale Hermes-Felder. Alte `localStorage`-Dokumente
  bleiben gültig; unbekannte Paneltypen werden beim Rückbau herausgefiltert.
- Orbit v6/v7 bleiben lesbar, v8 wird geschrieben. Die neuen Filterfelder haben Defaults und
  die vorhandenen Revisionsbackups bleiben unverändert.
- Benachrichtigungen liegen additiv in der bestehenden Workbench-SQLite-Datei. Deduplizierung
  erfolgt über `source`, `kind` und `remote_id`; Secrets werden vor Persistenz redigiert.

## API und Transport

Implementiert sind unter `/api/v1` unter anderem:

`/hermes/status`, `/hermes/sessions`, `/hermes/tasks`, `/hermes/cron`, `/hermes/results`,
`/hermes/models`, `/hermes/diagnostics`, `/hermes/services/action`,
`/hermes/update/status`, `/hermes/update/check`, `/hermes/update/run` sowie der
WebSocket `/hermes/chat`.

Der Chat spricht nie direkt ACP. Die Workbench-WebSocket-Brücke validiert das versionierte
interne Protokoll, dedupliziert Client-Nachrichten, fächert Ereignisse auf mehrere Panels und
lädt beim Sessionwechsel bzw. Reconnect die Historie erneut. Der ACP-Prozess ist lazy, wird
bei Absturz mit Backoff neu gestartet und beendet sich erst nach dem konfigurierten Leerlauf.

Die offizielle Verwaltung wird ausschließlich unter `/hermes` proxied. Der Proxy setzt den
Upstream-`Host` korrekt auf die Hermes-Loopback-Adresse, übergibt `X-Forwarded-Prefix`, streamt
Antworten, schreibt relative Redirects/Cookie-Pfade um und passt die Vite-Assetreferenzen für
Hermes v0.19 an. Das ephemere Hermes-Token bleibt serverseitig. `/hermes/api/config` ohne
Identität antwortete im Produktionstest mit `401`; der erlaubte Proxyzugriff auf `/hermes/`
antwortete mit `200`.

## Dienste und Updates

- `hermes-dashboard.service`: Loopback, `--no-open`, `--skip-build`, `Restart=always`.
- `hermes-update.service`: One-shot, Backup, Git-Update, Dashboard-SPA-Build,
  Dienstneustart, Healthchecks und redigierter Zustandslog.
- `hermes-update.timer`: täglich `04:15 Europe/Berlin` mit Randomisierung.
- `hermes-update-retry.timer`: Wiederholung alle 30 Minuten; ohne Pending-Zustand kein Lauf.
- Keine systemweite Unit, kein Root-Helper und kein `sudo`.
- Die Busy-Erkennung behandelt einen normal verbundenen Gateway-Zustand nicht mehr fälschlich
  als laufenden Dialog. Hermes v0.19 liefert für das Web-Paket keinen Lockfile; der Update- und
  Installationslauf verwendet deshalb `npm install`, wenn kein Lockfile vorhanden ist, und
  `npm ci` nur bei vorhandenem Lockfile.

Beim realen Update-Test wurde der Checkout von Commit
`38c09e5d739fd91b8f7d281ff92e3e321312cb3c` auf den aktuellen Commit
`3f497e2b4f92ef83f45a98c02f7cb47c12ee069e` aktualisiert. Hermes meldet final weiterhin
`v0.19.1 (2026.7.30)`. Der abschließende Lauf war erfolgreich und steht in
`phase=idle`, `pending=false`, `lastResult=none` mit „Already up to date“.

Ein erster Updateversuch nach dem Commit-Update scheiterte am fehlenden Hermes-Web-Lockfile.
Der Fehlerpfad wurde korrigiert, der Dashboard-Build anschließend erfolgreich ausgeführt und
der abschließende Update-Check erfolgreich wiederholt. Die Dienste blieben aktiv.

## Sicherheitszustand

- Dashboard bindet nur an Loopback; Port 9119 wird nicht per Tailscale Serve oder Funnel
  veröffentlicht.
- Serviceaktionen akzeptieren nur die festen Ziele `dashboard` und `gateway` und verwenden
  ausschließlich `execFile` mit `systemctl --user`; freie Unitnamen gelangen nicht in den
  Prozessaufruf.
- Projektpfade für ACP kommen nicht vom Browser, sondern werden über die Projektregistry und
  erlaubte Terminal-Roots geprüft.
- Hermes-Session-Token, API-Schlüssel und Providerwerte werden weder persistiert noch geloggt.
- Der Baseline-Befund der dauerhaft erlaubten gefährlichen Muster wurde bereinigt:
  rekursives Löschen, Löschen im Root-Pfad, privilegiertes `sudo`, Script-Ausführung per
  `-e/-c` und Überschreiben von Env-/Config-Dateien waren vorher vorhanden; die finale
  `command_allowlist` ist leer. `approvals.mode` ist `ask`, `cron_mode` bleibt `deny` und
  `destructive_slash_confirm` ist aktiviert.

## Tests und Verifikation

Grün abgeschlossen:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`: Contracts 10 Tests, Server 241 Tests in 49 Dateien, Web 105 Tests in 28
  Dateien
- `pnpm build`; der Hermes-Frontend-Chunk liegt bei rund 7,4 KiB gzip.
- `systemd-analyze verify` für Dashboard-, Update- und beide Timer-Units.
- Produktions-HTTP-Smoke: Health 200, direktes Dashboard 200, Proxy 200, geschützte
  Hermes-API ohne Identität 401, Hermes-REST-Endpunkte 200.
- Produktionsstatus: Hermes erreichbar/installiert, Gateway und Dashboard aktiv, Telegram
  verbunden, ACP-Transport verfügbar. Die Diagnose meldete 22 von 23 Punkten als `ok`; der
  einzige Hinweis ist der erwartete lazy ACP-Prozess, solange kein Chat-Client verbunden ist.
- Gezielter Playwright-Lauf nach der finalen UI-Korrektur: 5/5 Tests grün, darunter nativer
  Hermes-Desktop- und Mobile-Chat, Verwaltung, Session-/Admin-Pfad-Verhalten, Desktop-Shell
  Chromium und der bestehende Usage-Test.

Die manuelle Browserprüfung erfolgte mit dem headless Playwright-MCP, weil die T3-Preview wegen
fehlender Automation-Authentifizierung nicht verfügbar war. Geprüft wurden 1440×900,
1024×768, 768×1024 und 390×844: Navigation, nativer ACP-Stream, echte Tool-/Terminalkarte,
Stoppen, Verwaltung mit Cron-Route und Wiederherstellung, Sessionliste/Drawer,
Benachrichtigungen, Diagnose und alle fünf Orbit-Flächen. Native Hermes- und Admin-Seite
blieben dabei ohne Browser-Konsolenfehler. Die Orbit-Ansicht zeigte zusätzlich bereits
vorhandene Entwicklungsfehler aus Clerk/Codex bzw. code-server; diese lagen außerhalb der
Hermes-Flächen und wurden nicht durch die Integration erzeugt.

Die komplette alte E2E-Matrix wurde zusätzlich gegen eine absichtlich isolierte Minimalinstanz
gestartet. Private Legacy-Spezifikationen erwarten dort 21 konfigurierte Projekte und konnten
deshalb nicht als Produktregression gewertet werden; ein Firefox-Shell-Test blieb wegen dieser
fehlenden Projektvoraussetzung rot. Dieser Harness-Befund ist getrennt von den grünen Hermes-
Spezifikationen und der Browserprüfung gegen den laufenden Dienst dokumentiert.

## Screenshots

Die während der Browserprüfung abgelegten Nachweise wurden nach Abschluss der v2-UI-Arbeiten
gelöscht und durch frische Aufnahmen in `docs/screenshots/` ersetzt, die in der README
veröffentlicht sind.

## Abweichungen vom Plan Fassung 2

1. Der laufende Hermes-Stand ist v0.19.1 statt der im Plan verifizierten v0.14.0. Die Adapter
   normalisieren die tatsächlich vorhandene v0.19-API; der Checkout blieb bewusst an seinem
   bestehenden Ort außerhalb des Repositories.
2. Der im Plan genannte Pfad `acp_registry/icon.svg` existiert im aktuellen Checkout nicht.
   Die Workbench verwendet deshalb die vorhandene Caduceus-Form im lokalen Icon-System und
   dokumentiert die Lizenz-/Herkunftsabweichung im Icon-Code und in der Architektur.
3. Der Plan nennt mehrere einzelne Backend-Dateien (`settings.ts`, `diagnostics.ts`,
   `update-service.ts`, `chat-bridge.ts`). Die Umsetzung bündelt kleine, eng gekoppelte
   Teile in den vorhandenen Hermes-Routen-, Status- und ACP-Modulen, ohne die öffentliche API
   oder die Sicherheitsgrenzen zu verändern.
4. Der systemd-Updateprozess kann den Workbench-API-Aufruf zur Busy-Erkennung nicht mit einer
   Browser-Tailscale-Identität ausführen. Er nutzt deshalb direkt Dashboard-, Cron-, Gateway-
   und ACP-Zustände; der native ACP-Manager kennt laufende Web-Prompts unmittelbar.
5. Die Browser-Automation lief für die UI-Matrix auf einer isolierten Port-3110-Instanz mit
   expliziter Entwicklungsidentität. Der Produktionsdienst wurde danach wieder gestartet und
   separat per API, Proxy, Unit- und Dashboard-Health geprüft.

## Rollback

Workbench-seitig:

```bash
systemctl --user disable --now hermes-dashboard.service hermes-update.timer hermes-update-retry.timer
rm -f ~/.config/systemd/user/hermes-dashboard.service \
  ~/.config/systemd/user/hermes-update.service \
  ~/.config/systemd/user/hermes-update.timer \
  ~/.config/systemd/user/hermes-update-retry.timer
systemctl --user daemon-reload
# hermes.enabled = false in config/workbench.local.json setzen
bash scripts/restart-all.sh
```

Bei einem fehlgeschlagenen Hermes-Update kann der vorherige Commit mit dem dokumentierten
Rollback aus `docs/troubleshooting.md` wiederhergestellt werden. Alternativ steht das offizielle
`hermes backup`-ZIP für `hermes import` bereit. `hermes-gateway.service`, `~/.hermes`,
`state.db` und Telegram werden beim Workbench-Rollback nicht gelöscht oder verschoben.

Es wurden keine Secrets in das Repository, den Bericht oder die Screenshots übernommen.
