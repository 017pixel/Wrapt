# Server-SDK

Der Default-Export ist `definePlugin({ setup(ctx) {} })`. Setup kann asynchron sein
und eine Cleanup-Funktion zurückgeben. Registrierungen werden automatisch mit dem
Prozess entfernt. Eigene Timer, Subprozesse und Netzwerkverbindungen über
`ctx.effect(cleanup)` aufräumen und `ctx.signal` beachten.

## Context

| Feld | Bedeutung |
| --- | --- |
| `id`, `version` | ID und aktive Version des Plugins |
| `signal` | Wird beim Entladen abgebrochen |
| `paths.source` | Registrierter Quellordner |
| `paths.release` | Verifizierter, unveränderlicher Build |
| `paths.data` | Persönlicher Datensnapshot dieses Releases |
| `log.info/warn/error(message, data?)` | Begrenzter, redigierter Inspektor-Verlauf |
| `effect(cleanup)` | Eigene Ressourcen in umgekehrter Reihenfolge aufräumen |
| `lifecycle.beforeSnapshot(flush)` | Flüchtigen Zustand vor Reload, Wechsel oder Deaktivierung dauerhaft speichern |
| `host.describe()` | Verfügbare öffentliche Host- und Plugin-Schnittstellen |
| `host.call(operation, input?)` | Öffentliche Fachoperation aufrufen |

Setup läuft vor dem Registry-Commit auf einer Kopie der Plugin-Daten. Es darf
Schemas migrieren und Handler registrieren. Mutierende Host-Aufrufe, fremde
Plugin-Aufrufe und Event-Publishing sind währenddessen gesperrt. Starte solche
Arbeit mit einem Job `runOnActivation`. Freie OS-Zugriffe von vertrauenswürdigem
Code kann Wrapt nicht transaktional zurücknehmen.

Wenn dein Plugin Daten im Arbeitsspeicher puffert, registriere den Abschluss
mit `ctx.lifecycle.beforeSnapshot(async () => { ... })`. Wrapt stoppt neue
Handler, wartet laufende Aufrufe ab und führt diese Funktionen vor der Kopie
aus. Ein Fehler bricht den Wechsel ab. Der Callback kann mehrfach laufen und
sollte deshalb idempotent sein. Nutze darin eigene Daten und Dateien, keine
rekursiven Plugin-Aufrufe.

`effect(cleanup)` räumt anschließend Ressourcen auf. Es ist kein Speicherschritt
für den neuen Release: SDK-Schreibzugriffe nach dem eingefrorenen Snapshot
werden abgelehnt und im Inspektor gemeldet. Direkte Dateizugriffe sind bei
vertrauenswürdigem Code technisch frei; speichere Dateizustand ebenfalls in
`beforeSnapshot`, bevor der alte Prozess beendet wird.

## Typisierte RPC

```ts
ctx.rpc.register("greet", {
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: (input, request) => ({ message: `Hallo ${input.name}` }),
});
```

`request` enthält `userId`, `requestId`, optional `projectId` und `signal`.
Er trägt die Aufrufidentität weiter. Hintergrundarbeit verwendet eine
Plugin-Identität. Globale mutable Variablen sind kein Ersatz für Request-Kontext.
Browseraufrufe verwenden `ctx.rpc.call("greet", { name: "Ada" })`.
HTTP: `POST /api/v1/plugins/runtime/personal.example/rpc/greet`, Body ist der Input.
Die HTTP-Antwort ist `{ "result": ... }`; das Browser-SDK entfernt diesen Umschlag.

## Commands

```ts
ctx.commands.register("collect", {
  title: "Projektstand sammeln",
  input: z.object({ projectId: z.string() }),
  handler: async input => ctx.host.call("projects.get", input),
});
await ctx.commands.execute("collect", { projectId: "demo" });
```

Außerhalb des Plugins heißt dieser Command `personal.example:collect`.
Commands sind aufrufbare Fachaktionen, keine Shell-Befehle. Für eigene
vertrauenswürdige Prozesse nutze `node:child_process`, feste Argumente, sinnvolle
Zeitlimits und Cleanup. Prüfe dabei den Arbeitsordner und die erlaubte Aufgabe.

## Ressourcen

```ts
ctx.resources.register("tasks", {
  description: "Eigene Aufgaben",
  list: input => tasks.list(),
  get: input => tasks.get(z.object({ id: z.string() }).parse(input).id),
  create: input => tasks.create(taskSchema.parse(input)),
  update: input => {
    const change = z.object({ id: z.string(), value: taskSchema, expectedRevision: z.number() }).parse(input);
    return tasks.put(change.id, change.value, { expectedRevision: change.expectedRevision });
  },
  remove: input => tasks.remove(z.object({ id: z.string() }).parse(input).id),
});
```

Ressourcen behandeln ihre Inputs selbst mit Zod. Andere Plugins rufen
`ctx.resources.list("personal.example:tasks", query)` und entsprechend
`get/create/update/remove` auf. `host:notes` bildet Aktionen auf `notes.list`,
`notes.get` usw. ab. Fachnamen müssen exakt zu den Host-Operationen passen,
beispielsweise `notes.archive` statt einer erfundenen `notes.remove`.

## Dienste

```ts
import { defineMethod, z } from "@wrapt/plugin-sdk";

ctx.services.provide("scores", {
  calculate: defineMethod({
    input: z.object({ count: z.number() }),
    output: z.number(),
    handler: ({ count }) => count * 2,
  }),
}, { version: "1.0.0" });
const score = await ctx.services.call("personal.provider:scores", "calculate", { count: 3 });
```

Für die Ersetzung eines Host-Dienstes kann ein Provider `replace: "host:projects"`
deklarieren. Seine Methoden heißen dann beispielsweise `list` und `get`.
Der Host validiert die Ergebnisse seiner Fachoperationen weiterhin. Zwei aktive
Ersatzprovider für denselben Dienst sind ein Konflikt. Ein Ersatz darf nicht
dieselbe Host-Operation erneut aufrufen, sonst entsteht eine Rekursion.

Registrierungen liefern `dispose()`. Dynamische Registrierungen aktualisieren
das verfügbare Operationsregister nach der Aktivierung. Plugin-Abhängigkeiten
gehören mit Versionen ins Manifest, damit die Startreihenfolge feststeht.
