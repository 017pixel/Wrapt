# Mitarbeiten

Wrapt wird offen entwickelt. Beiträge können Fehler beheben, Abläufe vereinfachen, die Dokumentation verbessern oder Integrationen ergänzen. Vor einer größeren Änderung lohnt sich ein Blick in die vorhandene Architektur und die betroffenen Produktseiten.

## Vor dem Einstieg

- Lies die Projektregeln in [`AGENTS.md`](https://github.com/017pixel/Wrapt/blob/master/AGENTS.md) und die [README](https://github.com/017pixel/Wrapt/blob/master/README.md).
- Prüfe, ob die Frage schon im [Issue-Bereich](https://github.com/017pixel/Wrapt/issues) erfasst ist.
- Für Änderungen an einer API oder Extension beginne bei den Verträgen in `packages/contracts` beziehungsweise `packages/extension-contracts`.
- Halte Konfigurationswerte aus der Implementierung heraus. Persönliche Werte gehören in lokale Konfiguration, nicht in Beispiele oder Screenshots.

## Lokal entwickeln

Wrapt ist ein pnpm-Monorepo und braucht Node.js 22 oder neuer sowie pnpm 10. Der übliche Entwicklungsstart baut zuerst die Contracts und startet Backend und Weboberfläche mit Hot Reload:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Für den Serverstart muss eine lokale Konfiguration aus den Beispielvorlagen eingerichtet sein. Die Details stehen unter [Installation und erster Start](../betrieb/installation-erster-start.md) und [Konfigurieren](../betrieb/konfigurieren.md).

## Änderungen prüfen

Relevant sind die Checks, die die betroffenen Bereiche abdecken. Die zentralen Projektbefehle sind:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm architecture:extensions
pnpm architecture:file-lines
```

Bei UI-Änderungen sollte der echte Ablauf im Browser geprüft werden. Nutze für Screenshot-Änderungen eine isolierte Instanz mit neutralen Beispieldaten. Echte Konten, Hostnamen, lokale Pfade, Tokens oder andere persönliche Inhalte dürfen nicht in Screenshots oder Dokumentation gelangen.

## Projektkonventionen

- Schreibe neue API-Schemas zuerst in `packages/contracts`, bevor Server und Oberfläche sie verwenden.
- Baue `packages/extension-contracts` vor Änderungen, die dessen Schemas betreffen.
- Halte handgeschriebene Dateien unter 400 physischen Zeilen und trenne Module nach fachlicher Verantwortung.
- Verwende den vorhandenen Wrapt-Stil und die Tokens aus `apps/web/src/index.css` für UI-Änderungen.
- Bewahre bestehende Datenformate und öffentliche Schnittstellen; Breaking Changes brauchen eine Migration und eine Erklärung ihrer Folgen.
- Dokumentiere neue Einstellungen mit neutralen Beispielwerten. Secrets und personenbezogene Daten gehören nicht in das Repository.

## Dokumentation verbessern

Die Doku soll die Bedienung und das tatsächliche Verhalten der aktuellen Implementierung beschreiben. Wenn ein neues Feature sichtbar oder konfigurierbar wird, aktualisiere die passende Produkt- oder Betriebsseite und ergänze bei Bedarf den [Changelog](../changelog.md).

Schreibe Aufgaben schrittweise, verlinke verwandte Seiten und verwende Befehle relativ zum Repository-Root. Screenshots müssen aus einer isolierten Dokumentationsinstanz stammen. Details zum privaten Betrieb und zu den Sicherheitsgrenzen stehen unter [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md).

## Pull Request vorbereiten

Beschreibe in einem Pull Request kurz:

- welches Problem die Änderung löst,
- was sich für Nutzerinnen und Nutzer ändert,
- welche Checks ausgeführt wurden,
- ob Screenshots oder Dokumentation aktualisiert wurden.

Füge nur Änderungen bei, die zu diesem Beitrag gehören. Den Pull Request erstellst du im [GitHub-Repository](https://github.com/017pixel/Wrapt/pulls).
