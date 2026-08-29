# Wrapt Plugin-Marktplatz

Wrapt liefert einen Codex-Marktplatz mit, der den Skill `$plugin-creator` installiert.
Dieser Skill erstellt Wrapt-Plugins und Wrapt-Extensions. Er ist nicht mit dem allgemeinen
Codex-Skill gleichen Namens zum Erstellen von Codex-Plugins zu verwechseln.

## Enthaltener Aufbau

```text
.agents/plugins/
├── marketplace.json
└── plugins/
    └── wrapt-extension-creator/
        ├── .codex-plugin/plugin.json
        └── skills/plugin-creator/
            ├── SKILL.md
            ├── agents/openai.yaml
            └── references/authoring-api.md
```

Der Manifestname lautet `wrapt-extension-creator`, der Marktplatzname `wrapt` und der
installierte Skill `plugin-creator`.

## Installation in Codex

Voraussetzung ist eine Codex-Version mit dem Befehl `codex plugin`.

```bash
git clone https://github.com/017pixel/Wrapt.git
cd Wrapt
codex plugin marketplace add "$PWD/.agents/plugins"
codex plugin add wrapt-extension-creator@wrapt
```

Prüfen:

```bash
codex plugin marketplace list
codex plugin list --marketplace wrapt
```

Beim erneuten Hinzufügen eines bereits konfigurierten lokalen Marktplatzes meldet Codex
gegebenenfalls, dass die Quelle schon vorhanden ist. In diesem Fall genügt die bestehende
Konfiguration.

Nach einer Aktualisierung des geklonten Repositorys liest der lokale Marktplatz die neue
Fassung. Falls Codex noch eine ältere Plugin-Fassung im Cache verwendet, entferne und
installiere ausschließlich dieses Plugin erneut:

```bash
codex plugin remove wrapt-extension-creator@wrapt
codex plugin add wrapt-extension-creator@wrapt
```

## Verwendung

Beispiel für einen persönlichen Draft in einer laufenden Wrapt-Instanz:

```text
$plugin-creator Erstelle ein Plugin mit einer Werkzeugseite für den Status meiner Projekte.
Verwende nur lesende Projektberechtigungen und aktiviere es erst nach erfolgreicher Validierung.
```

Beispiel für eine versionierte Extension:

```text
$plugin-creator Erstelle eine versionierte Beispiel-Extension beispiel.projektstatus
unter extensions/. Nutze den öffentlichen Contract und validiere das fertige Paket.
```

Der Skill entscheidet anhand des Auftrags zwischen zwei Modi:

- **Persönlicher Draft:** Änderungen laufen ausschließlich über die Authoring-API der
  lokalen Wrapt-Instanz. Bestehende Draft-IDs und Revisionen bleiben erhalten.
- **Versionierte Extension:** Dateien entstehen im Repository über
  `pnpm extension:create` und werden mit `pnpm extension:validate` geprüft.

Er aktiviert keinen fehlerhaften Draft, erweitert keine Permissions stillschweigend und
startet Wrapt oder Preview-Dienste nicht ohne ausdrückliche Freigabe neu.

## Wrapt-Plugin-Laufzeit

Persönliche Drafts liegen unter `<dataDir>/plugin-drafts`. Nach erfolgreicher Validierung
wird ein Laufzeitpaket unter `<dataDir>/extension-catalog` materialisiert. Beide Orte
liegen standardmäßig außerhalb des Git-Repositorys.

Versionierte Pakete unter `extensions/` verwenden denselben öffentlichen
`@wrapt/extension-contracts`-Vertrag. Dadurch können sie geprüft, geteilt und kontrolliert
in den lokalen Catalog übernommen werden.

Die vollständigen Regeln, Contributions und Permissions stehen im
[Authoring-Guide](authoring.md). Die exakten persönlichen API-Endpunkte sind als Referenz
direkt im installierten Skill enthalten.

## Marktplatz oder Wrapt-Extension?

Der Codex-Marktplatz verteilt die **Anleitung für den Coding-Agenten**. Er installiert kein
Werkzeug in der Wrapt-Laufzeit. Das vom Skill erzeugte Wrapt-Plugin wird anschließend über
die Wrapt-Authoring-API oder als versionierte Extension verwaltet.

Diese Trennung verhindert, dass Codex-Konfiguration, persönliche Drafts und
Repository-Extensions miteinander vermischt werden.

## Veröffentlichung eigener Extensions

Vor einer Weitergabe:

1. Eine stabile Publisher-ID und Extension-ID wählen.
2. Nur tatsächlich benötigte Permissions deklarieren.
3. Keine Accounts, Tokens, lokalen Pfade oder persönlichen Draft-Daten einchecken.
4. `pnpm extension:validate <ordner>` ausführen.
5. Relevante Tests, `pnpm typecheck` und `pnpm build` ausführen.
6. Installation, Aktivierung, Deaktivierung, Update und Deinstallation prüfen.

Erst das validierte Paket wird veröffentlicht. Ein persönlicher Draft ist keine
veröffentlichbare Quelle, solange er nicht bewusst exportiert, bereinigt und versioniert wurde.
