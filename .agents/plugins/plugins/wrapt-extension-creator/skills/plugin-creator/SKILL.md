---
name: plugin-creator
description: Erstellt oder aktualisiert persönliche Wrapt-Plugin-Drafts und versionierte Wrapt-Extensions. Verwenden, wenn in Wrapt ein neues Plugin entstehen, ein vorhandener Draft geändert oder eine Extension für das Repository vorbereitet werden soll. Nicht für allgemeine Codex-Plugins verwenden.
---

# Wrapt Plugin Creator

Erstelle die kleinste vollständige Erweiterung innerhalb der öffentlichen Wrapt-Verträge. Unterscheide zuerst zwischen einem persönlichen Plugin-Draft in einer laufenden Wrapt-Instanz und einer versionierten Extension im Repository.

## Modus wählen

- Persönlicher Draft: Der Nutzer arbeitet im Bereich `Plugins`, nennt eine Draft-ID oder möchte ein lokales Plugin aktivieren. Nutze ausschließlich die Authoring-API. Persönliche Inhalte bleiben außerhalb von Git.
- Versionierte Extension: Der Nutzer möchte ein Beispiel, eine First-Party-Extension oder ein veröffentlichbares Paket im Repository. Nutze `pnpm extension:create` und `pnpm extension:validate`.
- Fehlt bei einem persönlichen Draft die ID, liste vorhandene Drafts und gleiche Slug sowie Name ab. Erzeuge nur dann einen neuen Draft, wenn der Nutzer wirklich ein neues Plugin verlangt.

## Persönlichen Draft bearbeiten

Lies bei diesem Modus [references/authoring-api.md](references/authoring-api.md), bevor du schreibst.

1. Lies `AGENTS.md`, rufe den Ziel-Draft ab und prüfe Draft-ID, Slug, Revision, `pageMode`, Route, Flächen und Aktivierungsstatus.
2. Ändere nur `PluginDraftContent`. Entferne `id`, `createdAt` und `updatedAt` aus dem PUT-Inhalt. Bewahre bestehende Nutzerfunktionen, sofern der Auftrag ihre Entfernung nicht ausdrücklich verlangt.
3. Halte Blocks, HTML und Iframe gegenseitig ausschließend. Verwende nur deklarierte Host-Aktionen und die niedrigsten notwendigen Permissions.
4. Aktualisiere mit der erwarteten Revision. Bei `409 PLUGIN_REVISION_CONFLICT` lade den Draft neu und führe die beabsichtigte Änderung einmal erneut auf der aktuellen Fassung aus.
5. Validiere über die API. Aktiviere nur, wenn `valid: true` zurückkommt. Prüfe danach das materialisierte Paket mit `pnpm extension:validate`.
6. Verändere in diesem Modus keine Repository-Datei, keine Beispiel-Extension, keine CSP und keine Host-Runtime. Wenn ein Contract die gewünschte Fähigkeit nicht unterstützt, melde die konkrete Lücke.

## Versionierte Extension erstellen

1. Prüfe `docs/extensions/authoring.md`, die Beispiele unter `extensions/plugins/` und die öffentlichen Verträge in `packages/extension-contracts`.
2. Erzeuge das Grundgerüst mit `pnpm extension:create <publisher.name> [zielordner]`. Bearbeite keine persönliche Runtime-Ablage.
3. Nutze `extension.json` als Source of Truth. Fordere nur benötigte Permissions an und verwende vorhandene Contributions, bevor du Core-APIs erweiterst.
4. Halte UI- und Server-Entrypoints im Extension-Ordner. Importiere keine internen Core-Module ohne öffentlichen Contract.
5. Führe mindestens `pnpm extension:validate <ordner>`, relevante Tests, `pnpm typecheck` und `pnpm build` aus.

## Gemeinsame Grenzen

- Starte Frontend, Backend, Preview-Dienste oder die laufende Workbench nie ohne ausdrückliche Freigabe neu.
- Nutze das bestehende Wrapt-Design: keine Gradients, keine Emojis, keine freien Hardcoded-Farben, Touch-Ziele mindestens 44 Pixel.
- Iframes bleiben sandboxed. Bereinigtes HTML enthält keine freien Scripts. Secrets, Identitätsheader und lokale Pfade gehören nicht in Logs oder Abschlussberichte.
- Führe keine stillen Breaking Changes an Manifesten, persistierten Daten oder Contributions ein.
- Für persönliche Drafts ist die Authoring-API die einzige Schreibquelle. Für versionierte Extensions sind Repository-Dateien die einzige Schreibquelle.

## Abschluss

Berichte Modus, Ziel-ID oder Extension-ID, Route, angeforderte Permissions und konkrete Prüfergebnisse. Bei persönlichen Drafts bestätige, dass keine Repository-Datei geändert wurde. Bei versionierten Extensions nenne die geänderten Dateien und ob Installation, Aktivierung, Deaktivierung und Update geprüft wurden.
