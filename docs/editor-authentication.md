# GitHub, Copilot und Settings Sync im Editor

Wrapt verwendet standardmäßig code-server unter `/editor/`. GitHub-Anmeldung
für Repositories funktioniert dort per Gerätecode in einem separaten Fenster.
Die GitHub-Seite bleibt außerhalb des iframe; der Editor wartet auf die
Bestätigung. Wrapt speichert keine GitHub-Tokens.

## Warum Copilot und Sync hier scheitern

Die geprüfte Installation ist code-server 4.128.0. Ihr Produkt verwendet Open
VSX. Die Anfrage für `github.copilot-chat` endet dort mit 404; außerdem fehlen
die Produktendpunkte für den nativen Microsoft-Settings-Sync-Dienst. Eine
Repository-Anmeldung und zusätzliche iframe-Berechtigungen ersetzen diese
Funktionen nicht. Das ist kein abgelehnter GitHub-Account.

- [Coder: Marketplace-Unterschiede](https://coder.com/docs/code-server/FAQ#why-cant-code-server-use-microsofts-extension-marketplace)
- [Microsoft: Copilot Chat fehlt in Open VSX](https://github.com/microsoft/vscode/issues/273508)
- [Coder: nativer Settings Sync](https://github.com/coder/code-server/issues/2195)
- [Microsoft: Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync)

## Optionaler offizieller VS-Code-Web-Editor

Der offizielle Editor ist als optionaler Anschluss verfügbar und wird nur nach
Freigabe aktiviert. Die private Installation dieses Auftrags verwendet ihn auf
Loopback-Port 8082; code-server bleibt auf 8080 erhalten.
`EDITOR_BACKEND=vscode` erhält den vollständigen `/editor`-Pfad für die offizielle
CLI. Der Standard `code-server` entfernt das Präfix weiterhin auf dem Upstream-Hop.
Beide Varianten nutzen HTTP und WebSocket unter derselben geschützten Wrapt-Origin.

`node scripts/vscode-editor.mjs --prepare` lädt nur die offizielle CLI. Es ändert
keinen Dienst und keine Anmeldung. `--print-command` zeigt den Startaufruf ohne
etwas zu starten. CLI und Datenverzeichnis lassen sich über `VSCODE_WEB_CLI` und
`VSCODE_WEB_DATA_DIR` einstellen; `CODE_SERVER_PORT` bestimmt den Loopback-Port.
Bestehende code-server-Daten bleiben getrennt erhalten. Alte URLs unter
`/editor/absproxy/` und `/editor/proxy/` erreichen weiterhin den bisherigen
code-server über `CODE_SERVER_LEGACY_PORT` (Standard 8080).

Vor einem Start müssen die [VS-Code-Server-Lizenz](https://code.visualstudio.com/license/server)
und die erlaubte Nutzung geklärt sein. Microsoft untersagt Hosting bzw. das
Bereitstellen als eigene Anwendung für andere Nutzer. Der Launcher verlangt die
explizite Option `--start --accept-server-license-terms`. Er bindet nur an Loopback
und setzt `/editor` als Basispfad. Kein Tailscale-Tunnel wird eingerichtet.

Eine Umstellung der laufenden Workbench benötigt einen separat freigegebenen
Editor-Wechsel und Backend-Neustart. Dabei den bisherigen Editor erhalten,
seine Daten sichern und bestehende Sitzungen berücksichtigen. Der Nutzer hat den isolierten Test und die Umstellung bei Erfolg freigegeben.
Die User-Unit `vscode-editor.service` wird aus
`deploy/systemd/units/vscode-editor.service.template` gerendert. Der allgemeine
Installer aktiviert sie nicht automatisch.

Im offiziellen Editor erfolgt die Anmeldung unter Konten. Danach Copilot und
„Backup and Sync Settings“ aktivieren. Das benötigt die persönliche Bestätigung
bei GitHub und gegebenenfalls eine Copilot-Berechtigung. Ohne Schlüsselbund können
Server-Tokens nur bis zum Prozessende bestehen; die Persistenz muss beim Wechsel
separat geprüft werden, siehe [Microsoft: VS Code Server](https://code.visualstudio.com/docs/remote/vscode-server#_i-see-an-error-about-keyring-storage-what-should-i-do).

## Einbettung und Prüfstand

Die geprüfte offizielle Version ist VS Code 1.141.0. Das eingebaut mitgelieferte
Copilot-Manifest verlangt eine API, die in seiner Produktfreigabe fehlt. Wrapt
vergleicht beide ausgelieferten Dateien und ergänzt nur fehlende Copilot-APIs
über die öffentliche Startoption `productConfiguration`. Microsoft-Dateien,
Anmelde-Callbacks, Geheimnisspeicher und CSP bleiben erhalten. Explizite
Copilot-Freigaben im Startdokument werden nicht überschrieben. Bei passenden
Versionen oder fehlenden Metadaten bleibt das Startdokument unverändert.
`EDITOR_HTML_MAX_BYTES` begrenzt das gepufferte Startdokument (Standard 2 MiB).

In der isolierten Wrapt-Instanz sind WebSocket-Verbindung und beide nativen
GitHub-Gerätecode-Einstiege nachgewiesen: Copilot und Settings Sync öffnen GitHub
in einem separaten Fenster, während das iframe geöffnet bleibt. Der Nutzer hat am 13.10.2026 die persönliche GitHub-Anmeldung und die Funktion
von Copilot und Settings Sync bestätigt. Die Hilfe ist im Editor über das
Drei-Punkte-Menü unter „GitHub und Sync“ erreichbar. Die Token-Persistenz nach
einem weiteren Dienst-Neustart wurde nicht eigens geprüft.

VS Code ist kostenlos. Die Server-Lizenzannahme schließt kein kostenpflichtiges
Abonnement ab. Copilot-Tarife sind separat; die Einrichtung bucht weder einen
Tarif noch ein kostenpflichtiges Probeabo.

## Rückkehr zu code-server

`EDITOR_BACKEND=code-server` und `CODE_SERVER_PORT=8080` in `.env` setzen,
die Service-Prüfung wieder auf `http://127.0.0.1:8080/` richten und den
freigegebenen Backend-Neustart ausführen. Einstellungen, Erweiterungen und
Anmeldungen der bisherigen code-server-Installation bleiben erhalten. Der
optionale offizielle Dienst kann danach getrennt deaktiviert werden.
