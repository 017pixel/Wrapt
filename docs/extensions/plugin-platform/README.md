# Lokale Plugin-Plattform

Ein Code-Plugin ist dein eigener lokaler Quellordner mit TypeScript oder JavaScript,
optional React und einer `plugin.json`. Wrapt liefert Compiler, SDK, React und Zod
mit. Du installierst keine Plugin-Pakete und veröffentlichst nichts.

Deklarative Entwürfe bleiben unterstützt. Sie eignen sich für einfache, vom Host
begrenzte Werkzeuge. Format 3 ist für ausführbaren Servercode, eigene Datenmodelle,
Hooks, Dienste, Hintergrundarbeit und veränderbare Oberflächen gedacht.

## Lesepfad für KI-Agenten

1. [Start und Manifest](./getting-started.md): Dateien, Build und erster Aufruf.
2. [Server-SDK](./server-sdk.md): RPC, Commands, Ressourcen und Dienste.
3. [Daten und Migrationen](./storage.md): Collections, Revisionen, Transaktionen.
4. [Hooks, Ereignisse und Jobs](./hooks-events-jobs.md): Verhalten verändern.
5. [React und UI-Flächen](./client-sdk.md): Seiten, Transformationen und Slots.
6. [Host-APIs](./host-api.md): dieselben Fachoperationen wie in Wrapt.
7. [Entwicklung und Lifecycle](./development.md): Ordner, CLI, Reload, Rollback.
8. [Fehlerbehandlung und Vertrauen](./troubleshooting.md).
9. [Ausführbares Projektjournal](./examples.md) mit vollständigen Quellen.
10. [Laufzeit konfigurieren](./configuration.md) und Safe Mode.
11. [Praxistest mit freien KI-Modellen](./verification.md), Befunde und Grenzen.

Die vollständigen Typen stehen in `packages/plugin-sdk/src/`. Die laufende Instanz
liefert ihr tatsächliches Operationsregister über `GET /api/v1/plugins/api`.
Diese Dokumentation ist authentifiziert unter `/api/v1/plugins/docs/` verfügbar.

## Ablauf

```text
Lokale Quellen → Typprüfung und Build → verifizierter Release-Slot
                                            ↓
Vollvertrauen → eigener Prozess → Setup und Migration auf Datenkopie
                                            ↓
Registry-Commit → aktive Fachschnittstellen → React im Browser
                       ↓ Fehler vor Commit
                 bisheriger Release bleibt aktiv
```

Der Server startet Code erst nach ausdrücklicher Vertrauensfreigabe durch einen
Workbench-Administrator. Servercode besitzt die Rechte des Wrapt-Systembenutzers.
Der eigene Prozess ermöglicht Lifecycle und Fehlerbegrenzung, er ist keine Sandbox.
Browsercode läuft mit dem Zugriff der angemeldeten Wrapt-Oberfläche.

## Fähigkeiten und Grenzen

| Bereich | Öffentliche Schnittstelle |
| --- | --- |
| Eigene Plattform | React-Seiten, Navigation, eigene RPC und Collections |
| Bestehende UI | Beiträge ergänzen, ändern, verstecken, entfernen, ersetzen |
| Fachlogik | Before-/After-Hooks, Ressourcen, ersetzbare Dienste |
| Hintergrundarbeit | Ereignisse und Jobs mit Zeitlimit und Verlauf |
| Serverressourcen | `node:`-Module, Dateien, Netzwerk, eigene Prozesse |
| Entwicklung | Lokaler Ordner, API-Editor, CLI, Typdiagnosen, Auto-Reload |
| Betrieb | Deaktivieren, Safe Mode, Release-Rollback mit eigenem Datensnapshot |

Authentifizierung, Recovery und die Vertrauensfreigabe sind keine ersetzbaren
Host-Operationen. UI-Transformationen verändern keine Daten oder Berechtigungen.
Ausblenden ist kein Zugriffsschutz. Es gibt keinen Marketplace und keine
Installation von npm-Plugins. Externe npm-Imports werden beim Build abgelehnt.
