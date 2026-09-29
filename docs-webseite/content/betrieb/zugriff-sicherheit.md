# Zugriff und Sicherheit

Wrapt ist für privaten, selbst gehosteten Zugriff ausgelegt. Der Server bindet standardmäßig an Loopback. Tailscale Serve gibt den Dienst privat per HTTPS frei und übergibt die Identität, die Wrapt für Zugriffsentscheidungen prüft.

## Zugriffsmodell

1. Der Client verbindet sich über den privaten Tailscale-Zugang.
2. Wrapt prüft die übermittelte Tailscale-Identität gegen **tailscale.allowedUsers**.
3. Schreibende Verwaltungsaktionen verlangen zusätzlich eine berechtigte Admin-Identität und eine gültige Same-Origin-Anfrage.
4. WebSockets und eingebettete Anwendungen laufen über die Wrapt-Routen, damit Identität und Origin geprüft werden können.

Gib den Dienst nicht direkt über eine öffentliche Router-Portfreigabe oder Tailscale Funnel frei. Der empfohlene Weg ist Tailscale Serve:

~~~bash
bash deploy/proxy/configure-tailscale-serve.sh
~~~

Der Befehl verwendet die Werte aus **config/wrapt.local.json** und benötigt intern **sudo**, um Tailscale Serve zu konfigurieren. Er legt zuvor eine Statuskopie an. Nach einer Änderung der Portzuordnung muss das Skript erneut ausgeführt werden.

## Dienste hinter Wrapt

code-server, T3 Code, Hermes Agent und OpenCode Web sollen auf Loopback bleiben. Verwende ihre Wrapt-Routen, statt die internen Dienstports direkt an Browser oder Internet weiterzugeben:

| Dienst | Wrapt-Pfad |
| --- | --- |
| code-server | **/editor/** |
| T3 Code | **/t3** |
| Hermes Agent | **/hermes** |
| OpenCode Web | **/opencode** |

Hermes-Schlüssel und Session-Tokens bleiben bei Hermes beziehungsweise im serverseitigen Adapter. Zugangsdaten der CLI-Werkzeuge gehören in deren eigene Anmeldespeicher. Übernimm diese Werte nicht in Browserzustand, öffentliche Fehlerberichte oder Screenshots.

## Benutzer und Administratoren

Zugriff bekommt nur, wer in **tailscale.allowedUsers** steht. Administrative Mutationen erlaubt **tailscale.adminUsers**; ist diese Liste leer, gilt aus Kompatibilitätsgründen der erste Eintrag aus **allowedUsers** als Admin. Setze die Adminliste explizit, wenn nicht alle zugelassenen Nutzer verwalten dürfen.

Bewahre **.env**, **config/wrapt.local.json**, die Datenbank und Backups mit privaten Dateirechten auf. Ein Backup enthält dieselben schützenswerten Daten wie die laufende Instanz.

## Lokales Vertrauen

**security.localLoopbackTrust** ist standardmäßig **false**. Wenn du es einschaltest, vertraut Wrapt direkten Loopback-Anfragen ohne Tailscale- oder Forwarded-Header. Das hilft, wenn der Browser auf demselben Rechner läuft, gewährt aber keiner entfernten Verbindung Zugriff.

Loopback-Vertrauen unterscheidet nicht zwischen lokalen Prozessen und Betriebssystemkonten. Aktiviere es nur auf einem Rechner, dessen lokale Prozesse vertrauenswürdig sind. Adminrechte vergibt weiterhin allein **tailscale.adminUsers**.

## Sichere Betriebsregeln

- Halte **HOST** auf **127.0.0.1**, wenn Tailscale Serve der vorgesehene Zugang ist.
- Verwende HTTPS für Geräte außerhalb des Servers. Eine direkte HTTP-Verbindung über eine Tailscale-IP ist kein gleichwertiger Ersatz.
- Halte Node.js, pnpm, Wrapt und die optionalen Komponenten aktuell.
- Teile Logs nur als gezielten, bereinigten Ausschnitt. Die Anwendung redigiert typische Secret- und Cookie-Felder, dennoch können Logs Betriebsdetails enthalten.
- Sichere Konfiguration und Laufzeitdaten verschlüsselt und mit beschränktem Zugriff.
- Setze keine automatische Freigabe- oder Sandbox-Umgehung für Agenten voraus. Die Werkzeug-CLIs behalten ihre eigenen Sicherheitsabfragen.

## Vorschau- und Projektgrenzen

Terminals werden vor dem Start gegen **terminalAllowedRoots** geprüft. Verwende möglichst eng begrenzte Roots statt eines pauschalen Zugriffs auf das gesamte Dateisystem.

Preview-Dienste bleiben an ihre Nutzeridentität und ihren Slot gebunden. Cookies gelten hostweit und werden nicht durch unterschiedliche Ports getrennt. Wenn eine Vorschau oder ein Slot nicht erreichbar ist, prüfe zuerst den Status; starte oder beende fremde Preview-Prozesse nicht als Diagnosemaßnahme.

## Mehr erfahren

- [Konfiguration](../betrieb/konfigurieren.md)
- [Installation und privater Zugriff](../betrieb/installation-erster-start.md)
- [Fehlerdiagnose](../betrieb/fehlerdiagnose.md)
