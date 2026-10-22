# Start und Manifest

Öffne **Plugins → Code-Plugins**. Erstelle eine Vorlage oder registriere deinen
lokalen Ordner. Bearbeite die Dateien, baue das Plugin und prüfe die Diagnosen.
Die erste Aktivierung verlangt Vollvertrauen. Wrapt selbst muss dafür nicht neu starten.

## Dateiaufbau

```text
mein-plugin/
  plugin.json
  server.ts
  ui.tsx
  README.md
```

```json
{
  "formatVersion": 3,
  "id": "personal.aufgaben",
  "name": "Meine Aufgaben",
  "description": "Eigene Aufgabenverwaltung",
  "version": "0.1.0",
  "server": "server.ts",
  "ui": "ui.tsx",
  "dependencies": {}
}
```

Mindestens `server` oder `ui` ist erforderlich. Pfade sind relativ zum Quellordner.
Die ID hat mindestens zwei durch Punkte getrennte Segmente aus kleinen Buchstaben,
Zahlen und Bindestrichen. `wrapt`, `workbench`, `host` und `system` sind reserviert.
`dependencies` enthält andere lokale Plugin-IDs und Semver-Bereiche, keine npm-Pakete.
Abhängigkeiten müssen beim Aktivieren bereits mit passender Version laufen.

Server und Browser können gemeinsame lokale Module importieren. Verwende `./datei.js`
für eine `datei.ts`, alternativ direkte `.ts`-Imports. Der Build trennt die vom
jeweiligen Einstiegspunkt erreichbaren Module. `node:`-Imports gehören nur in den
Servergraphen. Browsercode importiert React aus `react`, das SDK aus
`@wrapt/plugin-sdk/client`. Das Server-SDK heißt `@wrapt/plugin-sdk` und exportiert
auch `z` und `defineMethod`. Importiere Zod über das SDK.

## Kleines Server-Plugin

```ts
import { definePlugin, z } from "@wrapt/plugin-sdk";

export default definePlugin({
  setup(ctx) {
    const items = ctx.storage.collection("items", {
      schema: z.object({ title: z.string().min(1), done: z.boolean() }),
      indexes: ["done"],
    });
    ctx.rpc.register("list", { handler: () => items.list() });
    ctx.rpc.register("add", {
      input: z.object({ title: z.string().min(1) }),
      async handler(input) {
        const item = await items.create({ ...input, done: false });
        await ctx.events.emit("changed", { id: item.id });
        return item;
      },
    });
  },
});
```

Ein Datensatz hat `{ id, revision, value, createdAt, updatedAt }`. Die Nutzdaten
stehen in `value`. `list()` liefert direkt ein Array. Der Context besitzt kein
`db`, `app`, `router` oder `addPage`. Erfinde keine APIs, lies die SDK-Referenz.

## Kleines React-Plugin

```tsx
import { defineClientPlugin } from "@wrapt/plugin-sdk/client";
import { useEffect, useState } from "react";

export default defineClientPlugin({
  setup(ctx) {
    function Page() {
      const [items, setItems] = useState<Array<{ id: string; value: { title: string } }>>([]);
      const [error, setError] = useState("");
      useEffect(() => {
        ctx.rpc.call<typeof items>("list").then(setItems)
          .catch((error: Error) => setError(error.message));
      }, []);
      return <main className="page-scroll"><div className="page-frame">
        <h1>Meine Aufgaben</h1>
        {error ? <p role="alert">{error}</p> : null}
        <ul>{items.map(item => <li key={item.id}>{item.value.title}</li>)}</ul>
      </div></main>;
    }
    const path = "/plugins/app/personal/aufgaben";
    ctx.ui.register({ id: "personal.aufgaben.page.main", surface: "page", title: "Aufgaben", path, Component: Page });
    ctx.ui.register({ id: "personal.aufgaben.navigation.main", surface: "navigation", title: "Aufgaben", path });
  },
});
```

IDs müssen im eigenen Plugin-Namensraum liegen. Eine Page registriert eine Route;
ein Navigation-Beitrag macht sie in der Sidebar erreichbar. Beides ist nötig.
Verwende lokale Pfade. Wrapt-Design und Theme-Tokens weiterführen, keine weißen
Festflächen, Gradients oder Emojis. Touch-Ziele mindestens 44 × 44 px.

## Prüfen

`POST /api/v1/plugins/code/:id/build` liefert Datei, Zeile und Fehlermeldung.
Ein fehlgeschlagener Build ersetzt keinen funktionierenden Release.
Nach Aktivierung RPC und sichtbare Nutzeraktionen prüfen. Ein grüner Build allein
beweist keinen funktionierenden Ablauf. Teste leere Daten, fehlerhafte Eingaben,
erneutes Laden und Deaktivieren.
