import { localPluginDefinitionSchema, type LocalPluginSource } from "@wrapt/extension-contracts";

/** Kleines ausführbares Startprojekt, ohne Installation fremder Plugin-Pakete. */
export function pluginCodeTemplate(id: string, name: string): Omit<LocalPluginSource, "revision"> {
  const definition = localPluginDefinitionSchema.parse({ formatVersion: 3, id, name, description: "Mein persönliches Wrapt-Plugin", version: "0.1.0", server: "server.ts", ui: "ui.tsx" });
  return { definition, files: [
    { path: "server.ts", content: `import { definePlugin, z } from "@wrapt/plugin-sdk";

export default definePlugin({
  setup(ctx) {
    const items = ctx.storage.collection("items", { schema: z.object({ title: z.string().min(1) }) });
    ctx.rpc.register("list", { handler: () => items.list() });
    ctx.rpc.register("add", {
      input: z.object({ title: z.string().min(1) }),
      async handler(input) {
        const item = await items.create(input);
        await ctx.events.emit("changed", { id: item.id });
        return item;
      },
    });
  },
});
` },
    { path: "ui.tsx", content: `import { defineClientPlugin } from "@wrapt/plugin-sdk/client";
import { useEffect, useState } from "react";

interface Item { id: string; value: { title: string } }
export default defineClientPlugin({
  setup(ctx) {
    function Page() {
      const [items, setItems] = useState<Item[]>([]);
      const [title, setTitle] = useState("");
      const [error, setError] = useState("");
      const refresh = () => ctx.rpc.call<Item[]>("list").then(setItems).catch((error: Error) => setError(error.message));
      useEffect(() => {
        void refresh();
        const subscription = ctx.events.on("changed", () => { void refresh(); });
        return () => subscription.dispose();
      }, []);
      return <main className="page-scroll"><div className="page-frame">
        <h1>${name.replace(/[<>&{}]/g, "")}</h1>
        <form onSubmit={(event) => { event.preventDefault(); void ctx.rpc.call("add", { title }).then(() => { setTitle(""); return refresh(); }).catch((error: Error) => setError(error.message)); }}>
          <label>Eintrag<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <button className="quiet-button-primary" type="submit">Hinzufügen</button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
        <ul>{items.map((item) => <li key={item.id}>{item.value.title}</li>)}</ul>
      </div></main>;
    }
    const path = "/plugins/app/${id.replaceAll(".", "/")}";
    ctx.ui.register({ id: "${id}.page.main", surface: "page", title: ${JSON.stringify(name)}, path, Component: Page });
    ctx.ui.register({ id: "${id}.navigation.main", surface: "navigation", title: ${JSON.stringify(name)}, path });
  },
});
` },
    { path: "README.md", content: `# ${name}\n\nLokales Code-Plugin für Wrapt. Quellen ändern, bauen und ausdrücklich mit Vollvertrauen aktivieren.\n\nReferenz: GET /api/v1/plugins/docs/README.md und GET /api/v1/plugins/api.\n` },
  ] };
}
