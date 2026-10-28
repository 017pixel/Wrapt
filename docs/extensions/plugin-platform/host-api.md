# Öffentliche Host-APIs

`GET /api/v1/plugins/api` ist das tatsächliche Register der laufenden Instanz.
Nutze seine Namen, Beschreibungen und die aus den Zod-Verträgen erzeugten
`inputSchema`/`outputSchema`-Felder (JSON-Schema). Das SDK
verwendet `ctx.host.call(name, input)`. Für HTTP gilt
`POST /api/v1/plugins/host/:operation`, Antwort `{ result }`.

## Fachoperationen

| Name | Eingabe |
| --- | --- |
| `projects.list` | keine |
| `projects.get` | `{ projectId }` |
| `projects.register` | `{ path }`, nur im freigegebenen Dateibereich |
| `projects.touch` | `{ projectId }` |
| `projects.createFile` | `{ projectId, file }`, `createProjectFileRequestSchema` |
| `notes.list` | keine, liefert `{ notes, folders }` |
| `notes.search` | `noteSearchQuerySchema` |
| `notes.get` | `{ noteId }`, liefert `{ note }` |
| `notes.create` | `createNoteRequestSchema`, liefert `{ note }` |
| `notes.update` | `{ noteId, changes }`, `updateNoteRequestSchema` |
| `notes.move` | `{ noteId, changes }`, `moveNoteRequestSchema` |
| `notes.saveContent` | `{ noteId, changes: { content, expectedRevision } }` |
| `notes.archive`, `notes.restore` | `{ noteId }` |
| `noteFolders.create` | `{ name }` |
| `noteFolders.update` | `{ folderId, changes }` |
| `noteFolders.remove` | `{ folderId }` |
| `filesystem.tree` | `{ path?, cursor?, limit? }` |
| `filesystem.read` | `{ path }`, Textvorschau mit Größenlimit |
| `filesystem.search` | `{ q }` |
| `filesystem.state` | keine |
| `filesystem.saveState` | `saveFileManagerStateRequestSchema` |
| `filesystem.rename` | `fileManagerRenameRequestSchema` |
| `filesystem.move` | `fileManagerMoveRequestSchema` |
| `filesystem.remove` | `{ path }` |
| `filesystem.mkdir` | `fileManagerMkdirRequestSchema` |
| `git.status` | `{ projectId }`, Porcelain-Status mit Branch |
| `git.diff` | `{ projectId, staged?: boolean }`, ohne externe Diff-/Textconv-Helfer |
| `notifications.create` | `{ title, body, severity, link? }` |
| `notifications.list` | `{ limit?, unreadOnly? }` |
| `terminal.list` | keine, eigene Sitzungsmetadaten |
| `terminal.create` | `{ projectId?, cwd?, cols?, rows? }`, Shell öffnen |
| `terminal.write` | `{ sessionId, data }` |
| `terminal.close` | `{ sessionId }` |
| `previews.list` | keine, eigene Zuordnung, fremde Slots nur als belegt |
| `previews.open` | `previewSessionRequestSchema` |
| `previews.close` | `{ sessionId }` |

Die exakten Datenverträge stehen in `packages/contracts/src/`. Nicht jedes
fachliche Update ist ein allgemeiner JSON-Patch. Revisionsprüfungen, Pfadgrenzen
und bestehende Validierung gelten auch über das SDK.

Beispiel:

```ts
const created = await ctx.host.call<{ note: { id: string } }>("notes.create", {
  title: "Projektjournal",
});
ctx.log.info("Journal erstellt", { noteId: created.note.id });
```

Die REST-Oberflächen für Projekte, Dateiverwaltung und Notizen durchlaufen dieselben
Operationen. Binäre Downloads und Upload-Streams bleiben in der vorhandenen
Datei-API. Terminal- und Preview-Operationen nutzen die besitzerprüfenden Broker;
sie übernehmen die echte Aufrufidentität. Hintergrundjobs arbeiten unter der
Identität ihres Plugins und bekommen damit keine fremden Nutzersitzungen.
Die eigenen Wrapt-Flächen um T3, Hermes und andere eingebettete Werkzeuge sind
über Seiten und Panels ersetzbar. Deren interne Protokolle bleiben externe APIs.

## Eigene öffentliche Schnittstellen

| Aufruf | HTTP |
| --- | --- |
| Eigene RPC | `POST /plugins/runtime/:id/rpc/:name` |
| Command | `POST /plugins/commands/:qualifiedName` |
| Ressource | `POST /plugins/resources/:qualifiedName/:action` |
| Dienst | `POST /plugins/services/:qualifiedName/:method` |
| Ereignisse abonnieren | `GET /plugins/events`, Server-Sent Events |

Alle Pfade liegen unter `/api/v1`. Body ist jeweils das fachliche Input-Objekt.
Bei Ressourcen sind `list/get/create/update/remove` möglich, soweit der Provider
sie anbietet. Für Browser-UI sind `ctx.rpc`, `ctx.host`, `ctx.commands` und
`ctx.events` bereits vorhanden.

SDK- und Verwaltungsrouten verlangen die bestehende Workbench-Identität.
Verwaltungsaktionen verlangen Adminrechte. Browser-Mutationen bleiben durch
Same-Origin geschützt. Ein selbst gewählter `userId` im Request-Body ersetzt
keine Identität. Auth-, Account-Recovery- und Dienst-Neustart-Innereien sind
keine hookbaren Operationen.
