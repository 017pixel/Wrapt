# Wrapt-Plugin-Authoring-API

Diese Referenz gilt für persönliche deklarative Plugin-Drafts einer laufenden
Wrapt-Instanz. Der Standard-Origin ist `http://127.0.0.1:3010`.

## Identität

Alle Draft-Endpunkte verlangen eine erlaubte Admin-Identität. Lies die erste
konfigurierte Identität still aus `config/wrapt.local.json` und sende sie im Header
`tailscale-user-login`. Gib den Wert niemals aus, speichere ihn nicht und schreibe ihn
nicht in Prompts oder Logs. Fehlt die lokale Admin-Konfiguration, stoppe vor dem
Schreibzugriff und melde die Ursache.

## Endpunkte

| Zweck | Methode und Pfad |
| --- | --- |
| Beispiele lesen | `GET /api/v1/plugins/examples` |
| Eigene Drafts lesen | `GET /api/v1/plugins/drafts` |
| Einzelnen Draft lesen | `GET /api/v1/plugins/drafts/:id` |
| Draft erstellen | `POST /api/v1/plugins/drafts` |
| Draft vollständig aktualisieren | `PUT /api/v1/plugins/drafts/:id` |
| Draft validieren | `POST /api/v1/plugins/drafts/:id/validate` |
| Draft aktivieren | `POST /api/v1/plugins/drafts/:id/activate` |
| Draft deaktivieren | `POST /api/v1/plugins/drafts/:id/deactivate` |
| Draft löschen | `DELETE /api/v1/plugins/drafts/:id` |

Die POST-Endpunkte erhalten `{}` als JSON-Body. Beim Update ist die bevorzugte Form:

```json
{
  "expectedRevision": 3,
  "content": "<vollständiger PluginDraftContent>"
}
```

`content` muss die vollständige aktuelle Struktur aus
`packages/contracts/src/plugins.ts` enthalten. `id`, `createdAt` und `updatedAt`
gehören nicht in den Content. Erfinde keine Felder und sende keine partielle
Patch-Struktur.

## Sichere Reihenfolge

1. Drafts und Slugs lesen.
2. Bei Erstellung vollständigen Content posten oder bei Änderung die bestehende ID
   und Revision verwenden.
3. Nach jedem Schreiben mit leerem JSON-Body validieren.
4. Nur bei `valid: true` aktivieren.
5. Für Deaktivierung oder Löschung ausschließlich den passenden Lifecycle-Endpunkt
   verwenden.
6. Falls der Server ein Paket materialisiert, den Datenpfad still aus der lokalen
   Konfiguration lesen und das Paket mit
   `pnpm extension:validate <dataDirectory>/extension-catalog/<slug>` prüfen.

## Fehlergrenzen

- `409 PLUGIN_REVISION_CONFLICT`: aktuellen Draft laden, Änderung genau einmal mit
  der neuen Revision erneut anwenden.
- `409 PLUGIN_ACTIVE_SLUG_CHANGE`: aktiven Slug nicht still umbenennen; Nutzer fragen.
- `400 PLUGIN_VALIDATION_FAILED`: gemeldete Issues im Content beheben und erneut
  validieren.
- Unbekannte Capability oder Aktion: keine Core-Datei ändern; konkrete API-Lücke
  melden.

Persönliche Drafts verbleiben außerhalb des Git-Repositories. Der Store-Endpoint und
`extensions/plugins` sind nur zum Lesen mitgelieferter Beispiele da.
