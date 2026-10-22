# Plugins und Extensions

Mit lokalen Plugins kannst du eigene Werkzeuge und Anwendungen auf Wrapt bauen,
Daten sammeln und bestehende Oberflächen oder Abläufe verändern. Deine Quellen
bleiben lokal. Es gibt keinen Marketplace und keine Installation von npm-Plugins.

| Art | Geeignet für | Zugriff |
| --- | --- | --- |
| Deklarativer Entwurf | Einfache Werkzeuge und vorgegebene Aktionen | Vom Host begrenzt |
| Lokales Code-Plugin | Eigene React-Seiten, Datenmodelle, Hooks, Dienste und Jobs | Nach ausdrücklichem Vollvertrauen |
| Mitgelieferte Extension | Versionierte Produktbausteine und Beispiele | Bestehender Extension-Lifecycle |

![Plugin-Verwaltung mit neutralen Beispielen](../assets/12-plugins.png)

## Eigenes Code-Plugin erstellen

1. Öffne **Plugins → Code-Plugins**.
2. Erstelle ein Startprojekt oder registriere deinen eigenen lokalen Quellordner.
3. Bearbeite TypeScript, JavaScript oder React mit dem API-Editor oder deinem Editor.
4. Wähle **Bauen** und behebe angezeigte Fehler.
5. Prüfe den Code und bestätige bei der ersten Aktivierung das Vollvertrauen.
6. Teste echte Nutzeraktionen und gespeicherte Daten in der Oberfläche.

Wrapt bringt Compiler, SDK, React und Zod bereits mit. Das Startprojekt enthält
Server-RPC, dauerhafte Daten und eine eigene Seite mit Navigation. Deine Plugins
brauchen keine Änderung am Wrapt-Quellcode. Auto-Reload erkennt Quelländerungen
und hält bei Build- oder Setup-Fehlern die bisherige funktionierende Version aktiv.

## Was Code-Plugins verändern können

Du kannst Seiten, Dashboard-Bereiche, Navigation, Kopfleiste, Statusleiste,
Einstellungen, Kontextmenüs, Werkzeugflächen und Orbit-Inhalte ergänzen.
UI-Transformationen ändern vorhandene Beiträge oder blenden sie aus. Beim
Deaktivieren kehrt deren ursprünglicher Zustand zurück.

Auf dem Server stehen eigene Collections, Revisionen, Migrationen, RPC, Commands,
Ressourcen, Dienste, Ereignisse und Hintergrundjobs bereit. Hooks verändern
öffentliche Fachoperationen wie das Erstellen einer Notiz. Mehrere lokale
Plugins können über registrierte Dienste zusammenarbeiten.

## Vertrauen und Betrieb

Vertrauenswürdiger Servercode läuft mit den Rechten des Wrapt-Systembenutzers
und kann dessen Dateien, Netzwerk und Prozesse nutzen. Browsercode hat Zugriff
auf die angemeldete Wrapt-Oberfläche. Der eigene Prozess ist keine Sandbox.
Deklarative Plugins behalten ihre eingeschränkte Ausführung.

Die Verwaltung zeigt Build-Diagnosen, Logs, registrierte Schnittstellen und
Job-Verläufe. Du kannst Plugins deaktivieren, neu laden oder einen Release
zurückrollen. Ein Rollback stellt dessen eigenen Datensnapshot wieder her;
Host-Dateien und externe Änderungen werden nicht zurückgenommen. Safe Mode
verhindert bei einem Serverstart das Laden persönlichen Codes.

## KI-Agenten und Referenz

Der Creator-Skill `$wrapt-plugins` verweist auf einen gemeinsamen Markdown-Ordner
mit API-Verträgen, Abläufen und Beispielen. Agenten können dieselbe Referenz aus
der laufenden Instanz lesen. Ein einfacher Aufgabenprompt reicht als Start;
der Agent muss das erzeugte Plugin anschließend bauen und tatsächlich testen.

- [Plugin-SDK und Lesepfad für Agenten](../plugins/README.md)
- [Erstes Code-Plugin](../plugins/getting-started.md)
- [Server-SDK](../plugins/server-sdk.md)
- [React und veränderbare UI-Flächen](../plugins/client-sdk.md)
- [Lokale Entwicklung, CLI und Lifecycle](../plugins/development.md)
- [Vertrauen und Fehlerbehandlung](../plugins/troubleshooting.md)

Für einfache deklarative Entwürfe bleiben der visuelle Editor und die bisherige
Draft-API erhalten. Die Rubrik **Installieren** enthält mitgelieferte Beispiele,
deine persönlichen Quellen werden dadurch nicht veröffentlicht.
