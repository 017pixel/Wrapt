# Entwicklung und Lifecycle

## Lokale Wege

Unter **Plugins → Code-Plugins** kannst du eine Vorlage erstellen, Quellen
bearbeiten, bauen, Diagnosen lesen und aktivieren. Für größere Plugins registriere
einen eigenen lokalen Quellordner und arbeite mit deinem Editor darin. Wrapt
verändert registrierte externe Quellen nicht über einen vollständigen API-Write.

```bash
pnpm plugin init /tmp/mein-plugin personal.mein-plugin "Mein Plugin"
pnpm plugin register /tmp/mein-plugin
pnpm plugin build personal.mein-plugin
pnpm plugin activate personal.mein-plugin --trust
pnpm plugin inspect personal.mein-plugin
pnpm plugin dev personal.mein-plugin on
pnpm plugin disable personal.mein-plugin
```

Die CLI spricht dieselbe lokale Verwaltungs-API wie die Oberfläche an.
`WRAPT_PLUGIN_URL` ist standardmäßig `http://127.0.0.1:3010`.
Bei Bedarf nutzt `WRAPT_PLUGIN_USER` eine bereits freigeschaltete Workbench-Identität.
CLI und Agenten erfinden keine Identitäten und geben Identitätsheader nicht aus.
`--trust` ist eine ausdrückliche lokale Codefreigabe, kein Manifest-Feld.

## Verwaltungs-API

| Aktion | Methode und Pfad unter `/api/v1/plugins` |
| --- | --- |
| Quellen auflisten | `GET /code` |
| Startvorlage als Quellen lesen | `POST /code/template`, `{ id, name }` |
| Startvorlage verwaltet anlegen | `POST /code/scaffold`, `{ id, name }` |
| Eigenen Quellbestand anlegen | `POST /code`, `{ definition, files, expectedRevision: 0 }` |
| Lokalen Ordner registrieren | `POST /code/register`, `{ directory }` |
| Quellen lesen | `GET /code/:id/source` |
| Verwaltete Quellen ersetzen | `PUT /code/:id/source`, `{ definition, files, expectedRevision }` |
| Typprüfung und Build | `POST /code/:id/build` |
| Bauen und aktivieren | `POST /code/:id/activate`, `{ trust: false }` oder erste Freigabe `true` |
| Lifecycle | `POST /code/:id/actions`, `{ action, targetVersion? }` |
| Entwicklungsmodus | `PATCH /code/:id/development`, `{ enabled }` |
| Vertrauen entziehen | `POST /code/:id/revoke-trust` |
| Quellenregistrierung entfernen | `DELETE /code/:id` |
| Diagnose | `GET /code/:id/inspector` |
| Job ausführen | `POST /code/:id/jobs/:name` |

`files` ist ein Array aus `{ path, content }`. `plugin.json` wird aus `definition`
erzeugt und gehört nicht in `files`. Schreibanfragen brauchen die letzte gelesene
Revision. Bei Konflikt erneut laden und Änderungen zusammenführen.
Definition und Dateien werden beim Build tatsächlich gegen das SDK geprüft.

`actions` unterstützt `enable`, `disable`, `reload`, `rollback`, `uninstall`, `update`.
`activate` baut die aktuellen Quellen und installiert oder aktualisiert den
Release. Ein bloßes `enable` startet den zuletzt installierten Release.
`update` entspricht dem Bauen und Aktivieren der aktuellen Quellen ohne neue Vertrauensfreigabe.
`rollback` wählt standardmäßig die vorherige Version samt Datensnapshot.

## Auto-Reload

Aktiviere **Automatisch neu laden** für deinen Quellordner. Änderungen werden
erkannt, typgeprüft und bei aktivem Plugin neu aktiviert. Fehler bleiben als
Diagnose stehen, während der letzte funktionierende Release läuft. Ein
deaktiviertes Plugin wird durch eine Dateiänderung nicht automatisch aktiviert.

Auch Änderungen mit gleicher Manifest-Version erzeugen einen neuen Inhaltsdigest.
Für dauerhaft verständliche Releases die Version bewusst erhöhen. Manuelle
Builds und Lifecycle-Aktionen bleiben verfügbar. Hot-Reload erfordert keinen
Neustart der Workbench.

## Ablage

Alle folgenden Pfade liegen unter dem konfigurierten `dataDirectory`:

| Pfad | Inhalt |
| --- | --- |
| `plugin-sources/<id>/` | Registrierung, Vertrauen, Diagnosen und ggf. verwaltete Quellen |
| `extension-catalog/<id>/` | Letzter erfolgreicher privater Build |
| `extension-releases/` | Verifizierte Release-Slots |
| `extension-runtime/` | Aktive Pointer |
| `plugin-data/<id>/` | SQLite-Snapshots pro Aktivierungsversuch |
| `plugin-jobs.sqlite` | Ausführungsverlauf der Jobs |
| `extensions.sqlite` | Bestehende zentrale Extension-Registry |

Die private lokale Ableitung erscheint nicht im allgemeinen Beispiel-Catalog.
Kein persönliches Plugin gehört in den Wrapt-Quellcode oder in Harness-Ordner.
`uninstall` und das Entfernen der Registrierung behalten eigene Laufzeitdaten;
externe Quellordner bleiben ebenfalls erhalten.
