# Dokumentation

Dieser Index ordnet die Wrapt-Dokumentation nach Aufgabe. Für den ersten Start genügen
README, Installation und Konfiguration.

## Einstieg

| Ziel | Dokument |
| --- | --- |
| Projektüberblick und Schnellstart | [README](../README.md) |
| Manuelle Installation und Betrieb | [Installation](installation.md) |
| Einrichtung durch einen Coding-Agenten | [Agent-Setup](agent-setup.md) |
| Lokale Werte und Integrationen | [Konfiguration](configuration.md) |
| Häufige Fehler und Diagnose | [Fehlerbehebung](troubleshooting.md) |

## Plugins und Extensions

| Ziel | Dokument |
| --- | --- |
| Codex-Marktplatz und `$plugin-creator` installieren | [Plugin-Marktplatz](extensions/plugin-marketplace.md) |
| Persönliche Plugins und versionierte Extensions erstellen | [Extension Authoring](extensions/authoring.md) |
| Öffentliche Extension-Verträge verstehen | [Manifest ADR](adr/extension-manifest-v1.md) |
| Berechtigungsmodell verstehen | [Permission ADR](adr/extension-permission-model.md) |
| Laufzeit und atomare Aktivierung verstehen | [Runtime ADR](adr/extension-runtime-v1.md) |
| Lokalen Catalog verstehen | [Catalog ADR](adr/extension-local-catalog-v1.md) |

## Betrieb und Werkzeuge

- [Einstellungen](settings.md)
- [Terminal](terminal.md)
- [Previews für Agenten](previews-for-agents.md)
- [Einbettungstest](embedding-test.md)
- [Web-Push-Abnahme](web-push-acceptance.md)
- [Screenshot-Regeln](screenshots/README.md)

## Architektur und Sicherheit

- [Architektur](architecture.md)
- [Sicherheitsausnahmen](security-exceptions.md)
- [Extension Kernel Boundary](adr/extension-kernel-boundary.md)
- [Extension Server Authority](adr/extension-server-authority.md)
- [Extension Frontend Registries](adr/extension-frontend-registries.md)

Dateien unter `docs/goals/`, `docs/naechste-schritte.md` und `docs/previews-spikes.md`
dokumentieren Planung oder historische Entscheidungen. Sie sind keine Installationsanleitung.

## Dokumentationsstandard

- Beispiele verwenden ausschließlich neutrale Benutzer, Hosts und E-Mail-Adressen.
- Secrets, lokale Pfade, Tokens und echte Accountdaten werden nie dokumentiert.
- Befehle beziehen sich auf das Repository-Root.
- Öffentliche oder persistierte Breaking Changes enthalten Folgen und Migrationsweg.
- Screenshots werden in einer isolierten Instanz und mit T3 Code im Dark Mode erstellt.
