# Wrapt konfigurieren

Die Instanzkonfiguration liegt in **config/wrapt.local.json**. Als Startpunkt dient **config/wrapt.example.json**. Laufzeitwerte und Secrets können in **.env** gesetzt werden; ein dort definierter Wert überschreibt den gleichnamigen Konfigurationswert.

## Die beiden lokalen Dateien

| Datei | Verwenden für |
| --- | --- |
| **config/wrapt.local.json** | Identität, erlaubte Benutzer, Verzeichnisse, CLI-Pfade und Integrationen |
| **.env** | Secrets und neutrale Laufzeitwerte wie Host, Port, Log-Level oder Zeitlimits |

Beide Dateien sind umgebungsspezifisch. Nimm sie nicht in öffentliche Commits oder Screenshots auf. Die Beispielvorlagen enthalten neutrale Werte und dokumentieren die verfügbaren Schlüssel.

## Pfade und Projektzugriff

Bearbeite in **paths** vor allem:

- **projectsRoot**: Ordner, dessen direkte Projektverzeichnisse Wrapt anzeigen darf.
- **terminalAllowedRoots**: erlaubte Start- und Arbeitsverzeichnisse für Terminals.
- **terminalDefaultCwd**: Startverzeichnis, wenn kein anderes zulässiges Verzeichnis ausgewählt wird.
- **dataDir** und **databasePath**: persistente Wrapt-Daten und SQLite-Datenbank.
- **orbitBackupDir** und **orbitAssetDir**: Revisionssicherungen und Orbit-Dateien.
- **fileGalleryDir** und **wraptProfilesRoot**: Galerieinhalte und optionale Werkzeugprofile.

Verwende absolute Pfade, die im Dienstkontext tatsächlich existieren und beschreibbar sind. Begrenze Projekt- und Terminal-Roots auf den nötigen Bereich. Ein erlaubter Terminal-Root gewährt einem Terminal Zugriff auf Dateien darunter.

## Tailscale-Identitäten und Rollen

Unter **tailscale.allowedUsers** stehen die Tailscale-Login-Identitäten, die die Workbench verwenden dürfen. **tailscale.adminUsers** legt administrative Mutationen fest. Ist diese Liste leer, gilt aus Kompatibilitätsgründen der erste Eintrag aus **allowedUsers** als Administrator. Für eine klare Rollenverteilung trage die Admins daher ausdrücklich ein.

Die lokale Instanz bindet standardmäßig an **127.0.0.1** und verwendet Port **3010**. Lass **HOST** im Normalbetrieb auf Loopback. Der private Zugang von anderen Geräten sollte über Tailscale Serve erfolgen; mehr dazu unter [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md).

## Lokaler Zugriff ohne Tailscale

**security.localLoopbackTrust** ist standardmäßig ausgeschaltet. Wenn es aktiviert wird, kann ein Browser auf demselben Rechner Wrapt ohne Tailscale-Identität öffnen. Das ermöglicht keinen Zugriff von entfernten Geräten und unterscheidet lokale Prozesse nicht nach Betriebssystemkonto. Aktiviere diese Option deshalb nur, wenn Prozesse auf dem Rechner als vertrauenswürdig gelten.

**security.localUsername** benennt den lokalen Benutzer. Er erhält dadurch nicht automatisch Adminrechte: Dafür ist **tailscale.adminUsers** zuständig. Sind sowohl die Adminliste als auch **allowedUsers** leer, hat der lokale Benutzer keine Adminrechte.

## Optionale Integrationen

Integrationen bleiben lokal und optional:

- **T3 Code**: Kanal und Dienstkonfiguration liegen in **t3**. Stable und Nightly nutzen denselben Datenbestand. Ein Kanalwechsel wird mit **bash scripts/restart-backend.sh** angewendet, das den gewählten Kanal vor dem Backend-Neustart synchronisiert.
- **code-server**: Die systemd-Installation richtet ihn ein, wenn die Binary verfügbar ist. Der Dienst bleibt auf Loopback und wird über **/editor/** eingebettet.
- **Hermes Agent**: Die Verbindung zeigt auf eine vorhandene Installation. Hermes-Home, Sessions und Zugangsdaten verbleiben bei Hermes.
- **OpenCode Web**: Die offizielle Oberfläche läuft als Loopback-User-Dienst und wird über **/opencode** eingebettet.
- **Codex, Claude Code und OpenCode**: CLI-Pfade und gemeinsame Homes stehen in **paths** und **cli**.

Ändere Ports nur nach Prüfung auf Kollisionen. T3, Hermes, code-server und OpenCode Web werden nicht durch eigene öffentliche Portfreigaben verfügbar gemacht.

## .env und Entwicklungswerte

Die **.env.example** zeigt übliche neutrale Laufzeitwerte, darunter **HOST**, **PORT**, **LOG_LEVEL**, Cache- und Timeout-Werte. Geheimnisse gehören ausschließlich in eine lokale **.env** oder in den dafür vorgesehenen Integrationsspeicher.

**WRAPT_DEV_TAILSCALE_USER** ist ausschließlich ein Entwicklungshelfer für einen isolierten lokalen Testaufbau. Setze ihn in der aufrufenden Shell, niemals in der Produktions-**.env**. Der Produktionsserver verweigert den Start, wenn diese Variable gesetzt ist.

## Änderungen wirksam machen

Die Konfiguration wird beim Start gelesen. Für eine laufende Linux-Instanz:

~~~bash
systemctl --user restart wrapt.service
~~~

Bei lokalem Vordergrundbetrieb beendest du den laufenden Serverprozess kontrolliert und startest ihn erneut. Änderungen an Quellcode benötigen zusätzlich einen Build; dafür sind die Neustartskripte vorgesehen.

## Weiterführende Schritte

- [Installation und erster Start](../betrieb/installation-erster-start.md)
- [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md)
- [Sicherung und Update](../betrieb/sichern-wiederherstellen-update.md)
- [Fehlerdiagnose](../betrieb/fehlerdiagnose.md)
