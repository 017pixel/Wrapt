# Fehlerdiagnose

Gehe vom Server nach außen: zuerst lokaler Dienst und Health-Check, dann Identität und Tailscale, danach einzelne Integrationen. Stoppe keine Nutzer-Previews und starte sie auch nicht neu, um einen Fehler einzugrenzen.

## Wrapt antwortet nicht

Auf dem Linux-Server:

~~~bash
systemctl --user status wrapt.service
journalctl --user -u wrapt.service -n 100 --no-pager
curl -v --max-time 5 http://127.0.0.1:3010/api/v1/health
~~~

- **Dienst inaktiv:** Prüfe den letzten Fehler im Journal. Häufige Ursachen sind ungültige Konfiguration, fehlende Pfade oder ein nicht verfügbares Node-/pnpm-Setup.
- **Health-Check schlägt lokal fehl:** Der Fehler liegt zunächst beim Prozess oder beim lokalen Listener, nicht beim Tailscale-Zugang.
- **Health-Check funktioniert lokal, nicht über HTTPS:** Prüfe Tailscale Serve, den konfigurierten HTTPS-Port und die Benutzeridentität.
- **Health antwortet, Oberfläche fehlt:** Öffne **/wrapt/** und prüfe, ob der Produktionsbuild vorhanden ist. Bei Änderungen am Frontend muss der Web-Build aktuell sein.

Prüfe bei einem Konfigurationsfehler zunächst die JSON-Syntax, ohne den Inhalt auszugeben:

~~~bash
node -e 'JSON.parse(require("node:fs").readFileSync("config/wrapt.local.json", "utf8")); console.log("Konfiguration ist gültiges JSON")'
~~~

Danach kontrolliere, ob **paths.*** auf existierende und für den Dienstbenutzer les- beziehungsweise beschreibbare Ziele zeigen. Zeige **.env** oder **config/wrapt.local.json** nicht in einem öffentlichen Fehlerbericht.

## Zugriff verweigert oder Login fehlt

- Prüfe, ob die Tailscale-Verbindung des Clients aktiv ist.
- Vergleiche die übermittelte Identität mit **tailscale.allowedUsers**.
- Prüfe für Verwaltungsaktionen **tailscale.adminUsers**. Eine leere Liste macht den ersten erlaubten Benutzer zum Admin; bei leerer **allowedUsers**-Liste erhält der lokale Benutzer nicht automatisch Adminrechte.
- Rufe die Anwendung über die konfigurierte private HTTPS-Adresse auf. Eine direkte Dienst-Port-URL umgeht den vorgesehenen Proxy-Pfad.
- Bei lokalem Zugriff ohne Tailscale muss **security.localLoopbackTrust** bewusst aktiviert sein. Diese Einstellung gilt nur für Loopback.

Mehr dazu: [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md).

## Neustart oder Update hängt

Der API-Status zeigt Phase, aktuellen Schritt und bei Bedarf den letzten Log-Ausschnitt:

~~~bash
curl -fsS http://127.0.0.1:3010/api/v1/system/restart/status
~~~

Ist die Phase **failed**, lies den gemeldeten Schritt und das zugehörige Dienstjournal. Das Update-Skript bricht ab, wenn das Git-Arbeitsverzeichnis lokale Änderungen enthält. Sichere oder kläre diese Änderungen, bevor du erneut aktualisierst.

Ein Neustart lässt sich am Health-Endpunkt erkennen:

~~~bash
curl -fsS http://127.0.0.1:3010/api/v1/health
~~~

**bootId** ändert sich mit dem Backend-Prozess. **webBuildId** zeigt, ob das ausgelieferte Frontend neu gebaut wurde.

## Einzelne Integration prüfen

### code-server

~~~bash
systemctl --user status code-server.service
journalctl --user -u code-server.service -n 100 --no-pager
curl -f http://127.0.0.1:8080/healthz
~~~

Der Browserzugriff läuft über **/editor/**. Der lokale Port soll nicht separat veröffentlicht werden. Wenn der Editor lädt, aber WebSockets oder Dateien abbrechen, prüfe zuerst die Wrapt-Version und die WebSocket-Fehler im Serverjournal.

### Hermes Agent

~~~bash
systemctl --user status hermes-dashboard.service
journalctl --user -u hermes-dashboard.service -n 100 --no-pager
curl -f -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/api/status
~~~

Der festgelegte **Host**-Header ist für den lokalen Hermes-Health-Check nötig. Der Zugriff im Browser erfolgt über **/hermes**; der Dashboard-Port bleibt lokal. Bei getrenntem Chat prüfe zusätzlich die Hermes-Diagnose in Wrapt und lade die Verwaltungsseite neu.

### OpenCode Web

~~~bash
systemctl --user status opencode-web.service
journalctl --user -u opencode-web.service -n 100 --no-pager
curl -f http://127.0.0.1:3774/
~~~

Die eingebettete Web-Oberfläche muss über **/opencode** geöffnet werden, damit API-, Asset- und WebSocket-Pfade korrekt durch die Wrapt-Bridge laufen.

## Datenbank oder Orbit-Sicherung auffällig

Bei einer fehlenden oder beschädigten Datenbank:

1. Stoppe Wrapt, bevor du Dateien untersuchst oder änderst.
2. Kopiere Datenbank und vollständigen zugehörigen Backup-Ordner an einen separaten Ort.
3. Lass vorhandene Orbit-Revisionen unangetastet. Eine beschädigte Sicherung führt absichtlich zu einem Startfehler statt zu leeren Daten.
4. Stelle nur eine bekannte, prüfbare Sicherung wieder her.

Fehler wie **ORBIT_REVISION_CONFLICT** oder **ORBIT_DESTRUCTIVE_SAVE_BLOCKED** bedeuten, dass Wrapt den abweichenden Stand nicht still überschrieben hat. Bewahre den Browserentwurf und die Serverdaten auf und löse den Konflikt über die Oberfläche.

Die Schritte zur Wiederherstellung stehen unter [Sichern, wiederherstellen und aktualisieren](../betrieb/sichern-wiederherstellen-update.md).

## Vorschau meldet „nicht erreichbar“

Prüfe den Status des zugehörigen Devservers und lies die Vorschau-Diagnose. Der Preview Doctor kann einen Status oder Vorschläge neu ermitteln:

~~~bash
bash scripts/preview-doctor.sh --status
bash scripts/preview-doctor.sh --probe
~~~

Diese Diagnose verändert keinen Projektcode und startet keine Preview neu. Beende keine aktiven Preview-Prozesse und ändere keine Slot-Zuordnungen als Reparaturversuch; die Workbench verwaltet die laufenden Sitzungen.

## Logs sicher teilen

Erfasse nur den Zeitraum und Dienst, der den Fehler betrifft. Auch redigierte Logs können Hostnamen, lokale Pfade oder Projektnamen enthalten. Entferne solche Angaben vor dem Teilen und kopiere keine Umgebungsvariablen, Tokens, Cookies, **.env**- oder Konfigurationsinhalte.

## Weiter

- [Konfiguration prüfen](../betrieb/konfigurieren.md)
- [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md)
- [Update- und Wiederherstellungsschritte](../betrieb/sichern-wiederherstellen-update.md)
