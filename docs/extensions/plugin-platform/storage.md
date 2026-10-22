# Daten und Migrationen

Jedes Code-Plugin besitzt eine eigene SQLite-Datei im Wrapt-Datenbereich.
Andere Plugin-IDs werden über das SDK nicht direkt gelesen. Teilen erfolgt
über Dienste und Ressourcen. Dateien unter `ctx.paths.data` sind ebenfalls
persönlich und werden beim Wechsel mitkopiert. Für SQLite entsteht eine
konsistente Kopie über eine separate Datenbankverbindung. Eigene Dateiänderungen
aus freien Timern während des Wechsels sind nicht transaktional; halte solche
Arbeit in registrierten Handlern oder Jobs, die der Host beim Wechsel abwartet.

## Kleine Werte

```ts
await ctx.storage.set("settings", { showDone: false });
const settings = await ctx.storage.get<{ showDone: boolean }>("settings");
await ctx.storage.remove("temporary");
```

Werte sind JSON. `get()` liefert bei fehlendem Schlüssel `null`.
Speichere keine Browser-Tokens oder fremde Zugangsdaten in Plugin-Inhalten.
Der Plugin-Inspektor zeigt Logdaten, logge deshalb nur benötigte Metadaten.

## Collections

```ts
const schema = z.object({ title: z.string(), done: z.boolean(), projectId: z.string() });
const tasks = ctx.storage.collection("tasks", { schema, indexes: ["projectId", "done"] });
const created = await tasks.create({ title: "Prüfen", done: false, projectId: "demo" });
const page = await tasks.list({ limit: 50, offset: 0, filter: { done: false }, orderBy: "title" });
const current = await tasks.get(created.id);
if (current) {
  await tasks.put(current.id, { ...current.value, done: true }, { expectedRevision: current.revision });
}
await tasks.remove(created.id, { expectedRevision: 2 });
```

`create` erzeugt eine UUID. `put` erstellt oder ersetzt unter eigener ID.
`expectedRevision: 0` bedeutet, dass der Datensatz noch nicht existieren darf.
Eine veraltete Revision führt zu einem Konflikt. Die Revisionsnummer steigt bei
jedem erfolgreichen Schreiben. Nutzdaten stehen in `record.value`.

`list` liefert ein Array mit standardmäßig 100, maximal 1000 Datensätzen.
Pagination verwendet `limit` und `offset`, Filter vergleichen Felder auf Gleichheit.
`orderBy` nennt ein einfaches Feld, `descending` kehrt dessen Sortierung um.
Collection- und Feldnamen enthalten Buchstaben, Zahlen und Unterstriche.
Es gibt keine freie SQL-Schnittstelle im SDK.

## Transaktionen

```ts
await ctx.storage.transaction(async () => {
  await tasks.put("first", { title: "A", done: false, projectId: "demo" });
  await tasks.put("second", { title: "B", done: false, projectId: "demo" });
});
```

Wirft der Callback einen Fehler, werden beide Änderungen zurückgenommen.
Parallele SDK-Transaktionen werden serialisiert. Verschachtelte Calls derselben
Transaktion verwenden deren Kontext. Externe Host-Aufrufe oder Dateien sind
kein Teil dieser Datenbanktransaktion.

## Migration

```ts
await ctx.storage.migrate(1, async storage => {
  await storage.set("schema", { version: 1 });
});
```

Migrationen haben aufsteigende ganzzahlige Versionen, laufen einmal und atomar.
Halte Migrationen beim Setup klein. Eine fehlgeschlagene Migration verwirft den
Aktivierungsversuch, der bisherige Prozess und dessen Daten bleiben verfügbar.

Beim Versionswechsel friert Wrapt neue Aufrufe des alten Prozesses ein, wartet
laufende Handler ab und erstellt eine konsistente SQLite-Kopie. Erst nach
erfolgreichem Setup wird der neue Release aktiv.

## Rollback

Ein Release-Rollback lädt den vorherigen Code zusammen mit dessen letztem
eigenen Datensnapshot. Änderungen, die erst mit der neueren Version entstanden,
sind damit im zurückgerollten Plugin nicht enthalten. Der neuere Snapshot bleibt
als Sicherung erhalten. Ein Rollback ist keine Rückwärtsmigration und nimmt
keine Änderungen an Host-Notizen, Projektdateien oder externen Diensten zurück.
Sichere `plugin-data` gemeinsam mit der Extension-Registry und den Release-Slots.
