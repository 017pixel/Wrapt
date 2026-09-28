# Installation und erster Start

Wrapt ist eine selbst gehostete Entwicklungsumgebung im Browser. Der Server bindet standardmäßig an Loopback; für privaten Zugriff von anderen Geräten wird ein vorgeschalteter Tailscale-Zugang eingerichtet.

## Voraussetzungen

| Voraussetzung | Wann nötig |
| --- | --- |
| Node.js 22 oder neuer | Immer |
| pnpm 10 | Installation, Build und Entwicklung |
| Git und curl | Quellcode, Updates und Prüfung |
| Linux mit systemd | Empfohlener dauerhafter Serverbetrieb |
| tmux | Persistente Terminal-Sitzungen |
| Tailscale | Privater Zugriff von anderen Geräten |
| jq | Rollback-Prüfung bei der Tailscale-Serve-Einrichtung |

macOS eignet sich für den lokalen Vordergrundbetrieb. Der Linux-systemd-Weg ist für den dauerhaften Serverbetrieb vorgesehen.

## 1. Repository holen

~~~bash
git clone https://github.com/017pixel/Wrapt.git
cd Wrapt
node --version
pnpm --version
~~~

Node muss mindestens Version 22 und pnpm Version 10 melden. Wenn pnpm fehlt, kann das Installationsskript es über Corepack bereitstellen.

## 2. Lokale Dateien anlegen

~~~bash
cp config/wrapt.example.json config/wrapt.local.json
cp .env.example .env
~~~

Passe zuerst die lokale Konfiguration an:

- Ersetze Vorlagenwerte unter **system**, **tailscale** und **paths** durch Werte der eigenen Umgebung.
- Begrenze **paths.projectsRoot** und **paths.terminalAllowedRoots** auf Verzeichnisse, auf die Wrapt zugreifen darf.
- Fülle **tailscale.allowedUsers** mit den erlaubten Tailscale-Identitäten. Lege Administratoren nach Möglichkeit ausdrücklich in **tailscale.adminUsers** fest.
- Belasse **security.localLoopbackTrust** auf **false**, wenn kein Browser direkt auf demselben Rechner zugreift.
- Lass optionale Integrationen deaktiviert, bis deren lokale Programme eingerichtet sind.

Trage echte Passwörter oder Schlüssel nie in die Beispielvorlage ein. Persönliche Werte gehören in die lokale, nicht zu veröffentlichende Konfiguration; die **.env** ist für Secrets und neutrale Laufzeitwerte gedacht. Details stehen unter [Konfiguration](../betrieb/konfigurieren.md) und [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md).

## 3. Abhängigkeiten installieren und bauen

~~~bash
bash scripts/install-deps.sh
~~~

Das Skript prüft Node und pnpm, legt fehlende lokale Vorlagen an, installiert Abhängigkeiten und baut die Anwendungen. Es überschreibt vorhandene lokale Konfigurationsdateien nicht.

## 4. Lokal starten

Für Entwicklung mit Hot Reload:

~~~bash
pnpm dev
~~~

Öffne danach **http://127.0.0.1:5173/wrapt/**. Läuft der Vite-Proxy ohne Tailscale Serve, braucht er eine lokale Identität aus **tailscale.allowedUsers**. Setze **WRAPT_DEV_TAILSCALE_USER** vor dem Start nur in der aktuellen Shell:

~~~bash
export WRAPT_DEV_TAILSCALE_USER='HIER_ERLAUBTE_TAILSCALE_IDENTITAET_EINTRAGEN'
pnpm dev
~~~

Ersetze den Beispielwert durch eine bereits erlaubte Identität. Speichere diese Variable nie in **.env**; ein Produktionsserver verweigert den Start, wenn sie dort gesetzt ist.

Für den Produktionsbuild im Vordergrund:

~~~bash
pnpm build
pnpm start
~~~

Die Oberfläche wird dann unter **http://127.0.0.1:3010/wrapt/** ausgeliefert. Dieser Prozess endet, wenn das Start-Terminal geschlossen wird.

## 5. Dauerbetrieb unter Linux einrichten

Für Linux mit systemd-User-Diensten:

~~~bash
bash deploy/systemd/install.sh
~~~

Der Installer rendert und validiert die User-Units, installiert Abhängigkeiten, prüft Typen und baut das Projekt. Danach installiert und startet er Wrapt und richtet verfügbare Integrationen ein. Vorhandene Wrapt-Units werden im Repository unter **deploy/backups/** gesichert. Der Lauf verändert aktive Dienste und startet Wrapt; führe ihn daher bei einer geplanten Einrichtung oder Wartung aus.

Damit der Dienst auch ohne offene Anmeldung läuft, kann auf Linux systemd-Lingering erforderlich sein:

~~~bash
loginctl enable-linger "$(id -un)"
~~~

Dieser Systembefehl kann Administratorrechte benötigen. Wrapt selbst wird als User-Dienst und ohne **sudo** betrieben.

Status und Logs:

~~~bash
systemctl --user status wrapt.service
journalctl --user -u wrapt.service -n 100 --no-pager
~~~

## 6. Privaten Zugriff einrichten

Erst nachdem der lokale Health-Check funktioniert, konfiguriere Tailscale Serve:

~~~bash
bash deploy/proxy/configure-tailscale-serve.sh
~~~

Hostname, HTTPS-Port und Preview-Slots stammen aus **config/wrapt.local.json**. Das Skript sichert den bisherigen Serve-Status und benötigt intern **sudo** für den Tailscale-Befehl. Wrapt und integrierte Dienste bleiben auf Loopback. Veröffentliche die Ports nicht zusätzlich direkt im Router und aktiviere keinen Funnel.

## 7. Installation prüfen

~~~bash
curl -fsS http://127.0.0.1:3010/api/v1/health
~~~

Die Antwort muss **status: "ok"** enthalten. Danach die Oberfläche öffnen und prüfen, ob die konfigurierten Projektordner sichtbar sind. Für Tailscale-Zugriff außerdem mit einer erlaubten Identität anmelden.

## Nächste Schritte

- [Konfiguration anpassen](../betrieb/konfigurieren.md)
- [Zugriff und Sicherheit verstehen](../betrieb/zugriff-sicherheit.md)
- [Sicherung, Wiederherstellung und Updates](../betrieb/sichern-wiederherstellen-update.md)
- [Fehler diagnostizieren](../betrieb/fehlerdiagnose.md)
