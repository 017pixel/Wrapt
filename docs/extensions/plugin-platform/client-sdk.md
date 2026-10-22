# React und UI-Flächen

Der Browser-Einstieg exportiert `defineClientPlugin({ setup(ctx) {} })` aus
`@wrapt/plugin-sdk/client`. React wird aus `react` importiert. Wrapt stellt
dieselbe React-Instanz wie im Host bereit, auch für Hooks. Kein eigenes React
bündeln. Zod gibt es als `z` im Client-SDK.

## Beiträge

```tsx
ctx.ui.register({
  id: "personal.example.dashboard.summary",
  surface: "dashboard",
  title: "Projektjournal",
  order: 20,
  Component: Summary,
});
```

| Feld | Bedeutung |
| --- | --- |
| `id` | Eindeutige ID unter der eigenen Plugin-ID plus Punkt |
| `surface` | Eine der unten dokumentierten Flächen |
| `title` | Zugänglicher Titel |
| `path` | Lokale Route bei Seite oder Navigation |
| `order` | Sortierung als Zahl |
| `target` | Optionale konkrete Zielfläche, z. B. ein Panel-Typ |
| `Component` | React-Komponente mit `{ projectId?, selection? }` |
| `action` | Funktion für einfache Aktionsbeiträge |
| `children` | Alternativer React-Inhalt |

| Fläche | Anbindung |
| --- | --- |
| `page` | Eigene oder ersetzte Router-Seite |
| `navigation` | Desktop- und mobile Navigation |
| `dashboard` | Dashboard-Bereiche |
| `topbar` | Aktionen in der Kopfleiste |
| `statusbar` | Statusleiste unter der Arbeitsfläche |
| `settings` | Inhalt der aktiven Einstellungskategorie, optional `target` gleich Tab-ID |
| `context-menu` | Aktionen, optional `target` gleich Kontextmenü-Fläche |
| `panel` | Werkzeugfläche, optional `target` gleich Panel-Typ |
| `orbit` | Orbit-Inhalte, siehe Kontext und gespeicherte Extension-Knoten |

Fehler einer React-Komponente werden an der Flächengrenze abgefangen. Verwende
für asynchrone Actions eigene Fehlerzustände. Ein Promise aus einem Click-Handler
braucht ein `.catch()`, damit der Nutzer den Fehler sieht.

## Bestehende Beiträge verändern

```ts
ctx.ui.transform("navigation", editor => {
  const terminal = editor.list().find(item => item.path === "/terminal");
  if (terminal) editor.update(terminal.id, { title: "Meine Shell", order: 5 });
  const usage = editor.list().find(item => item.path === "/usage");
  if (usage) editor.hide(usage.id);
}, { priority: 20 });
```

`editor.list/get` zeigt die aktuelle Fläche. `update` ändert Titel, Reihenfolge,
Pfad oder Komponente. `hide` blendet aus, `remove` entfernt den Beitrag aus der
aufgelösten Ansicht. `replace(id, contribution)` ersetzt den Inhalt bei stabiler
ID und Fläche. Bei Deaktivierung kommen die ursprünglichen Beiträge zurück.
Ändere keine DOM-Knoten oder Host-Dateien für diese Aufgabe.

```tsx
ctx.ui.transform("dashboard", editor => {
  editor.replace("wrapt.dashboard.section.services", {
    title: "Mein Dienstestatus",
    Component: MyServiceStatus,
    order: 30,
  });
});
```

Stabile eingebaute IDs: `wrapt.dashboard.section.server`, `.projects`, `.services`,
`.runtime`, `.usage`, `.advanced`; `wrapt.shell.statusbar`;
`wrapt.shell.topbar.plugins`; `wrapt.settings.section.<tabId>`;
`wrapt.panel.<panelType>`. Seiten und Navigation haben ihre bestehenden
Contribution-IDs, sie sind über `editor.list()` ermittelbar.

Transformationen laufen bei der Darstellung synchron und dürfen keinen React-State
setzen, Netzwerkzugriffe starten oder Registrierungen erzeugen. Reagiere außerhalb
der Transformation auf Daten und rufe `ctx.ui.invalidate()` auf. Fehlerhafte
Transformationen werden verworfen. Reihenfolge: Priorität, Plugin-ID,
Registrierungsreihenfolge. Kollisionen von Routen sind zu vermeiden.

## Aufrufe und Slots

```ts
const projects = await ctx.host.call("projects.list");
const result = await ctx.rpc.call("list", { limit: 20 });
await ctx.commands.execute("collect", { projectId: "demo" });
ctx.navigate("/plugins/app/personal/example");
ctx.notify("Journal aktualisiert");
```

RPC ist auf das eigene Plugin bezogen. Commands können mit vollständigem
Plugin-Namen fremde registrierte Aktionen ausführen.

```tsx
ctx.slots.register("summary", Summary);
function Page() { return <section>{ctx.slots.render("summary")}</section>; }
```

Slots sind benannte Komponenten für eigene oder kooperierende Plugins.
Fremde Slots heißen `personal.provider:summary`. `effect(cleanup)` und
`signal` entsprechen dem Server-Lifecycle. Registrierungen räumt die Runtime
automatisch auf, React-Effekt-Abonnements zusätzlich beim Component-Unmount.
