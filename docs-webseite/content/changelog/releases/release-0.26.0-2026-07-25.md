# [0.26.0] - 2026-07-25

### Erstellt

- Einstellungen → „T3 Code Kanal": Umschalter zwischen Stable (`t3@latest`) und Nightly (`t3@nightly`) mit aktivem Kanal, Version und Erreichbarkeit
- `GET /api/v1/system/t3-channel` und `POST /api/v1/system/t3-channel` — Status lesen und Wunschkanal speichern
- `scripts/sync-t3-channel.sh` tauscht beim Neustart das npm-Paket, beendet den alten Prozess (SIGTERM, dann SIGKILL), wartet auf Port 3773 und prüft per HTTP, ob T3 wieder antwortet
- systemd-**User**-Unit `t3-code.service` (Template + Render + `scripts/install-t3-unit.sh`) mit unveränderten Argumenten `serve --host 127.0.0.1 --port 3773 <projectsRoot>`
- Abschnitt `t3` in `config/workbench.*.json` für Kanal, Paket, Pfade, Port und die Zeitlimits des Wechsels

### Verändert

- Der Kanalwechsel greift bewusst erst beim nächsten Neustart; die Card zeigt bei Abweichung „Neustart erforderlich" und springt zu den vorhandenen Neustart-Buttons
- `scripts/restart-backend.sh` und `restart-all.sh` prüfen den Kanal vor dem Dienst-Neustart — stimmt er und antwortet T3, passiert nichts
- Health-Check für T3 Code läuft über HTTP (`http://127.0.0.1:3773/`) statt über eine system-weite systemd-Unit, die es nie gab — der Dienststatus zeigt jetzt „active"
- T3-Proxy liest Host und Port aus der Config, statt sie doppelt zu hinterlegen
- T3 Code wird nicht mehr über `~/.local/bin/t3-code-service` gestartet; der Altstarter wird beim Wechsel beendet, damit Port 3773 frei wird
