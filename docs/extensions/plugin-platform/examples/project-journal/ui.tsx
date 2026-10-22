import { useEffect, useState } from "react";
import { defineClientPlugin } from "@wrapt/plugin-sdk/client";

interface Task { id: string; revision: number; value: { title: string; done: boolean } }

export default defineClientPlugin({
  setup(ctx) {
    function Journal() {
      const [tasks, setTasks] = useState<Task[]>([]);
      const [title, setTitle] = useState("");
      const [error, setError] = useState("");
      const [busy, setBusy] = useState(false);
      const refresh = () => ctx.rpc.call<Task[]>("list").then(setTasks);
      const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError("");
        try { await action(); await refresh(); }
        catch (error) { setError(error instanceof Error ? error.message : "Aktion fehlgeschlagen."); }
        finally { setBusy(false); }
      };
      useEffect(() => {
        const load = () => { void refresh().catch(error => setError(String(error))); };
        load();
        const subscription = ctx.events.on("changed", load);
        return () => subscription.dispose();
      }, []);
      return <section style={{ display: "grid", gap: 16, padding: 16 }}>
        <h2>Projektjournal</h2>
        <p>{tasks.filter(task => !task.value.done).length} offene Aufgaben</p>
        <form onSubmit={event => { event.preventDefault(); void run(async () => { await ctx.rpc.call("add", { title }); setTitle(""); }); }}>
          <label>Aufgabe<input style={{ minHeight: 44, fontSize: 16 }} required value={title} onChange={event => setTitle(event.target.value)} /></label>
          <button className="quiet-button-primary" style={{ minHeight: 44 }} disabled={busy}>Hinzufügen</button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
        <ul>{tasks.map(task => <li key={task.id}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
            <input type="checkbox" checked={task.value.done} disabled={busy} onChange={() => { void run(() => ctx.rpc.call("toggle", { id: task.id, expectedRevision: task.revision })); }} />
            {task.value.title}
          </label>
        </li>)}</ul>
        <button className="quiet-button" style={{ minHeight: 44 }} disabled={busy} onClick={() => { void run(() => ctx.commands.execute("collect")); }}>Projektstände sammeln</button>
      </section>;
    }
    const path = "/plugins/app/personal/project-journal";
    ctx.ui.register({ id: `${ctx.id}.page.main`, surface: "page", title: "Projektjournal", path, Component: Journal });
    ctx.ui.register({ id: `${ctx.id}.navigation.main`, surface: "navigation", title: "Projektjournal", path });
    ctx.ui.register({ id: `${ctx.id}.dashboard.main`, surface: "dashboard", title: "Projektjournal", Component: Journal });
  },
});
