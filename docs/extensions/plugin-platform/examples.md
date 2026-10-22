# Vollständiges Beispiel: Projektjournal

Die drei Dateien unter [examples/project-journal](./examples/project-journal/plugin.json)
bilden ein ausführbares Code-Plugin. Das Beispiel wird in den Integrationstests
tatsächlich gebaut und aktiviert. Es zeigt Aufgaben mit Revisionen, ein Notiz-Hook,
einen Sammler im Hintergrund, eine Command-Aktion sowie öffentliche Ressourcen
und einen versionierten Dienst. Dieselbe React-Komponente läuft als eigene Seite
und auf dem Dashboard.

Quellen: [Manifest](./examples/project-journal/plugin.json),
[Server](./examples/project-journal/server.ts), [React-Oberfläche](./examples/project-journal/ui.tsx).

Kopiere den Ordner in deinen persönlichen Plugin-Bereich, registriere diesen
Ordner und aktiviere ihn nach Prüfung. Änderungen gehören in diese persönliche
Kopie. Das dokumentierte Beispiel im Wrapt-Repository bleibt eine Vorlage.

```bash
cp -R docs/extensions/plugin-platform/examples/project-journal /tmp/mein-projektjournal
pnpm plugin register /tmp/mein-projektjournal
pnpm plugin build personal.project-journal
pnpm plugin activate personal.project-journal --trust
```

Die Seite erscheint in der Navigation. Neue Aufgaben bleiben nach einem Reload
erhalten. Beim Erstellen einer Host-Notiz entsteht ein eigener Journaldatensatz.
Der Job sammelt beim Aktivieren und dann alle zehn Minuten Projektstände.
Journaldaten und Snapshots kannst du über die RPCs `journal` und `snapshots`
abfragen; sie sind im Beispiel nicht als weitere Oberfläche eingebaut.

Ein anderes persönliches Plugin kann die Schnittstellen so verwenden:

```ts
const tasks = await ctx.resources.list("personal.project-journal:tasks");
const count = await ctx.services.call("personal.project-journal:summary", "count");
```

Deklariere dafür im konsumierenden Manifest
`"dependencies": { "personal.project-journal": "^0.1.0" }`.
Der Provider muss aktiv sein. Ein Versionswechsel betrifft nur dieses Plugin;
beim Deaktivieren verschwinden Seite, Dashboard und Navigation, die Daten bleiben.
