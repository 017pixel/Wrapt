# Hooks, Ereignisse und Jobs

## Before und After

```ts
ctx.hooks.register("notes.create", "before", event => {
  const input = z.object({ title: z.string().optional() }).passthrough().parse(event.input);
  event.input = { ...input, title: `[Journal] ${input.title ?? "Neue Notiz"}` };
}, { priority: 10 });

ctx.hooks.register("notes.create", "after", async event => {
  ctx.log.info("Notiz wurde erstellt", { requestId: event.request.requestId });
});
```

Die Reihenfolge ist aufsteigende Priorität, danach Plugin-ID, innerhalb desselben
Plugins Registrierungsreihenfolge. Input und Output bleiben an der Host-Grenze
validiert. Ein Before-Hook kann `event.cancelled = true` und `event.reason`
setzen. Dann wird die Originalaktion nicht ausgeführt. Mit `event.handled = true`
und einem gültigen `event.result` ersetzt er die Aktion vollständig.

After-Hooks laufen nach dem Erfolg. Sie können ein gültiges Resultat ersetzen.
Schlägt ein After-Hook fehl, wird sein Fehler geloggt und das letzte gültige
Ergebnis zurückgegeben. Eine bereits gespeicherte Notiz wird deshalb nicht
wegen eines nachgelagerten Hook-Fehlers erneut angelegt.

Host-Operationen heißen beispielsweise `projects.list` oder `notes.create`.
Plugin-RPC verwendet `personal.example:rpc/list`, Commands ihren vollständigen
Namen. Ressourcen und Dienste verwenden `personal.example:tasks/list`.
Rekursive Aufrufketten werden begrenzt. Vermeide im Hook den erneuten Aufruf
derselben Operation; arbeite mit `event.input`, `event.result` oder einem
separaten öffentlichen Dienst.

## Ereignisse

```ts
ctx.events.on("host:notes.create", async event => {
  await ctx.storage.set("lastNote", event.data);
});
await ctx.events.emit("changed", { projectId: "demo" });
```

Eigene Namen werden als `personal.example:changed` qualifiziert. Ein anderer
Consumer verwendet diesen vollständigen Namen. Host-Ereignisse beginnen mit
`host:` und dürfen nur vom Host veröffentlicht werden. Erfolgreiche mutierende
Fachoperationen liefern `{ input, result }` als Eventdaten.

Ereignisse sind unmittelbare Benachrichtigungen, keine dauerhafte Queue. Sammle
wichtige Zustände in einer Collection und gleiche nach Reconnect neu ab.
Listener-Fehler brechen die bereits erfolgte Fachoperation nicht ab.

Im Browser erhält `ctx.events.on(name, handler)` direkt `data`. Im Server
erhält der Handler `{ id, name, data }`. Beide liefern eine Registrierung zum
Aufräumen. Ein React-Effekt gibt `() => subscription.dispose()` zurück.

## Jobs

```ts
ctx.jobs.register("project-snapshot", {
  everyMs: 60_000,
  runOnActivation: true,
  timeoutMs: 5_000,
  maxAttempts: 1,
}, async request => {
  const projects = await ctx.host.call("projects.list");
  await ctx.storage.set("snapshot", projects);
});

ctx.jobs.register("note-index", {
  event: "host:notes.create",
  timeoutMs: 5_000,
}, async () => {
  await ctx.storage.set("indexUpdatedAt", new Date().toISOString());
});
```

`everyMs`, `event`, `runOnActivation`, `timeoutMs` und `maxAttempts` sind die
verfügbaren Optionen. Keine erfundenen Cron-Ausdrücke verwenden. Ein Job wird
pro Plugin und Name nicht überlappend ausgeführt. Ein Zeitlimit kann den
Plugin-Prozess beenden, damit Endlosschleifen den Host nicht blockieren.

`await ctx.jobs.run("project-snapshot")` startet manuell. `history(name?)`
liefert den persistenten Verlauf. Der Inspektor zeigt Status und Fehler.
Beim Serverabbruch verbleibende laufende Jobs werden beim nächsten Start als
unterbrochen markiert. Es gibt keine automatische Wiederholung verpasster Takte.
Wiederholungen nur bewusst mit `maxAttempts` aktivieren und idempotent schreiben.

`ctx.effect()` räumt eigene Langzeitressourcen auf. Verwende für geplante Arbeit
bevorzugt Jobs; freie Timer müssen selbst zuverlässig gestoppt werden.
