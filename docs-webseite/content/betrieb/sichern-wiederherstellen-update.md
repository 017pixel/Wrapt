# Sichern, wiederherstellen und aktualisieren

Wrapt-Code und Nutzerdaten liegen getrennt. Ein Git-Update oder Build aktualisiert die Anwendung; es ersetzt die externe SQLite-Datenbank und die in **paths** konfigurierten Datenverzeichnisse nicht. Für einen Ausfall brauchst du trotzdem eigene, geprüfte Sicherungen.

## Was gesichert werden sollte

Prüfe die tatsächlich verwendeten Einträge in **config/wrapt.local.json** und **.env**. Sichere mindestens:

- die Wrapt-SQLite-Datei aus **paths.databasePath** sowie den Inhalt von **paths.dataDir**;
- **paths.orbitBackupDir**, **paths.orbitAssetDir** und **paths.fileGalleryDir**, sofern sie nicht bereits in **dataDir** enthalten sind;
- **paths.wraptProfilesRoot**, wenn angelegte Profile erhalten bleiben sollen;
- Projektdateien unter **paths.projectsRoot**, falls diese nicht an anderer Stelle gesichert werden;
- **config/wrapt.local.json** und **.env** in einem privaten, verschlüsselten Sicherungsspeicher.

Die Pfade können außerhalb des Git-Repositories liegen. Prüfe deshalb vor jeder Sicherung, ob die konfigurierten Verzeichnisse wirklich im Backup enthalten sind. Hermes-Daten, Tailscale-Konfiguration und Konten der CLI-Werkzeuge liegen in ihren eigenen Homes und brauchen eigene Sicherungsregeln.

Die Orbit-Revisionsdateien und Extension-Registry-Snapshots helfen bei lokalen Wiederherstellungen. Sie ersetzen kein externes Backup: Ein Defekt oder Verlust des Datenträgers kann Datenbank und lokale Snapshots zugleich treffen.

## Konsistente Sicherung erstellen

Bei einer Linux-User-Unit:

~~~bash
systemctl --user stop wrapt.service
~~~

Erstelle dann eine Kopie der konfigurierten Datenbank und Verzeichnisse auf einem anderen, geschützten Ziel. Solange der Dienst gestoppt ist, erfasst eine Datei-Sicherung auch SQLite-WAL-Zustände vollständig. Wenn andere Prozesse dieselbe Datenbank beschreiben, stoppe auch diese Writer oder nutze ein SQLite-kompatibles Online-Backup.

Sichere keine Backups in ein Verzeichnis, das du beim nächsten Lauf vollständig ersetzt. Prüfe nach dem Kopieren Dateigrößen und Zeitstempel, bewahre Eigentümer und Zugriffsrechte und verschlüssele das Ziel. Starte die Instanz anschließend wieder:

~~~bash
systemctl --user start wrapt.service
curl -fsS http://127.0.0.1:3010/api/v1/health
~~~

Ein erfolgreicher Health-Check zeigt, dass der Dienst wieder erreichbar ist; eine spätere Wiederherstellungsprobe ersetzt er nicht.

## Wiederherstellung

Das Einspielen einer älteren Sicherung ersetzt den aktiven Datenstand. Prüfe zuerst, ob du das richtige Ziel und den richtigen Zeitpunkt gewählt hast.

1. Stoppe Wrapt und alle weiteren Prozesse, die dieselbe Datenbank oder Dateien beschreiben.
2. Kopiere den aktuellen Stand vollständig an einen separaten Quarantäne-Ort. Lösche ihn nicht.
3. Vergleiche Sicherung und Ziel anhand ihrer Konfigurationspfade. Spiele nur die benötigten Verzeichnisse und Datenbankdateien zurück.
4. Stelle Dateieigentümer und private Zugriffsrechte wieder her.
5. Starte Wrapt und prüfe Health, Projekte, Orbit-Daten und die benötigten Integrationen.

Fehlt die SQLite-Datei, kann Wrapt die Orbit-Arbeitsfläche aus einer geprüften lokalen Revision wiederherstellen. Das rekonstruiert nicht die übrigen Tabellen und Nutzerdaten der Datenbank. Ist die Sicherung beschädigt, schlägt der Start absichtlich fehl, statt eine leere Arbeitsfläche anzulegen. Lösche in diesem Fall keine Revisionsdateien und lege keine leere Datenbank an. Bewahre die Dateien und nutze eine bekannte gute externe Sicherung.

Wiederhergestellte Daten können älter sein als der Stand vor dem Ausfall. Lass den bisherigen Stand bis zur fachlichen Prüfung unangetastet, damit du verlorene neuere Daten bei Bedarf noch vergleichen kannst.

## Wrapt aktualisieren

Vor dem Update:

1. Sichere Datenbank, konfigurierte Datenverzeichnisse und lokale Konfiguration.
2. Prüfe, ob das Git-Arbeitsverzeichnis sauber ist. Das Update-Skript bricht bei lokalen Änderungen ab.
3. Plane einen kurzen Ausfall ein. Das Update baut die Anwendung und startet den Dienst neu.

Für den verwalteten Linux-Dienst:

~~~bash
bash scripts/update-and-restart.sh
~~~

Das Skript holt nur Fast-Forward-Änderungen des aktuellen Branches, installiert die Abhängigkeiten, baut Contracts, Frontend und Backend und plant den Dienstneustart. T3 Code und OpenCode Web werden beim Neustart mit ihrer Konfiguration synchronisiert.

Den Fortschritt zeigt **GET /api/v1/system/restart/status**; bei einem Fehler enthält die Antwort den letzten Schritt. Der Gesundheitsendpunkt **/api/v1/health** liefert **bootId** und **webBuildId**: Eine neue **bootId** bestätigt einen neuen Backend-Prozess, eine neue **webBuildId** einen neuen Frontend-Build.

Bei manuellem Vordergrundbetrieb holst du Änderungen kontrolliert mit **git pull --ff-only**, installierst beziehungsweise baust anschließend und startest den Prozess neu. Verwende das Update-Skript nicht, wenn du lokale Änderungen bewusst behalten musst.

## Rollback vorbereiten

Wenn ein Update scheitert, bewahre zuerst dessen Diagnose und die Sicherung des vorherigen Datenstands. Rolle Anwendungscode nur auf einen bekannten Commit zurück, wenn du geprüft hast, dass dabei keine lokalen Änderungen verloren gehen. Stelle Nutzerdaten getrennt und nur bei Bedarf aus ihrer Sicherung wieder her; ein Code-Rollback und ein Daten-Rollback sind unterschiedliche Vorgänge.

Bei unterstützten älteren Datenformaten führt Wrapt Teile der Umstellung selbst aus. Welche Daten übernommen werden und worauf du achten solltest, steht unter [Ältere Daten und Migrationen](./altbestand-und-migration.md).

## Verwandte Anleitungen

- [Konfiguration](../betrieb/konfigurieren.md)
- [Fehlerdiagnose](../betrieb/fehlerdiagnose.md)
- [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md)
