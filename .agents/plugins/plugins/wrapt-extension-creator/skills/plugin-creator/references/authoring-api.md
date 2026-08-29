# Wrapt Plugin Authoring API

Diese Referenz gilt nur für persönliche, deklarative Plugin-Drafts einer laufenden Wrapt-Instanz. Standard-Origin ist `http://127.0.0.1:3010`.

## Identität

Mutierende Endpunkte verlangen einen erlaubten Admin-Account. Lies die erste konfigurierte Identität still aus `config/wrapt.local.json` und übergib sie im Header `tailscale-user-login`. Gib den Wert nie aus. Ist keine Admin-Identität konfiguriert, stoppe und bitte den Nutzer um eine gültige lokale Konfiguration.

## Endpunkte

| Zweck | Methode und Pfad |
| --- | --- |
| Beispiele lesen | `GET /api/v1/plugins/examples` |
| Drafts auflisten | `GET /api/v1/plugins/drafts` |
| Draft lesen | `GET /api/v1/plugins/drafts/:id` |
| Draft erstellen | `POST /api/v1/plugins/drafts` |
| Draft aktualisieren | `PUT /api/v1/plugins/drafts/:id` |
| Draft validieren | `POST /api/v1/plugins/drafts/:id/validate` |
| Draft aktivieren | `POST /api/v1/plugins/drafts/:id/activate` |
| Draft deaktivieren | `POST /api/v1/plugins/drafts/:id/deactivate` |
| Draft veröffentlichen | `POST /api/v1/plugins/drafts/:id/publish` |

Die POST-Endpunkte für Validierung, Aktivierung, Deaktivierung und Veröffentlichung erhalten `{}` als JSON-Body.

## Schreibformat

Erstellen erwartet einen vollständigen `PluginDraftContent`. Aktualisieren erwartet bevorzugt:

```json
{
  "expectedRevision": 3,
  "content": {}
}
```

`content` ist der vollständige aktuelle Draft-Inhalt ohne `id`, `createdAt` und `updatedAt`. Die maßgebliche Definition steht in `packages/contracts/src/plugins.ts`. Erfinde keine Felder und sende keine partielle Patch-Struktur.

## Sichere Reihenfolge

1. Ziel-Draft lesen und ID, Slug sowie Revision prüfen.
2. Vollständigen Inhalt mit `expectedRevision` aktualisieren.
3. Mit leerem JSON-Body validieren.
4. Nur bei `valid: true` mit leerem JSON-Body aktivieren.
5. Den konfigurierten `paths.dataDir` still lesen und das Paket unter `extension-catalog/<slug>` mit `pnpm extension:validate` prüfen.

Ein vorhandener Draft wird immer über seine bestehende ID aktualisiert. Bei einer Slug-Kollision oder einer unpassenden ID darf keine Ersatzkopie entstehen.

## Fehlergrenzen

- `409 PLUGIN_REVISION_CONFLICT`: aktuelle Fassung neu laden, Änderung einmal neu anwenden.
- `409 PLUGIN_ACTIVE_SLUG_CHANGE`: zuerst Nutzerentscheidung einholen, weil ein aktiver Slug nicht still geändert wird.
- `400 PLUGIN_VALIDATION_FAILED`: Issues aus der Validierungsantwort beheben, nicht durch direkte Catalog-Schreibzugriffe umgehen.
- Nicht unterstützte Capability: konkrete Contract-Lücke nennen und keine Core-Erweiterung ohne neuen Auftrag beginnen.
