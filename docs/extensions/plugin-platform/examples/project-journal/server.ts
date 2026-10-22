import { definePlugin, defineMethod, z } from "@wrapt/plugin-sdk";

const taskSchema = z.object({ title: z.string().trim().min(1).max(200), done: z.boolean() });
const changeSchema = z.object({ id: z.string(), expectedRevision: z.number().int().positive() });

export default definePlugin({
  async setup(ctx) {
    const tasks = ctx.storage.collection("tasks", { schema: taskSchema, indexes: ["done"] });
    const journal = ctx.storage.collection("journal");
    const snapshots = ctx.storage.collection("snapshots");
    await ctx.storage.migrate(1, async storage => { await storage.set("initialized", true); });

    const changed = () => ctx.events.emit("changed", null);
    ctx.rpc.register("list", { handler: () => tasks.list({ limit: 1000 }) });
    ctx.rpc.register("add", {
      input: taskSchema.pick({ title: true }),
      async handler(input) {
        const saved = await tasks.create({ ...input, done: false });
        await changed();
        return saved;
      },
    });
    ctx.rpc.register("toggle", {
      input: changeSchema,
      async handler(input) {
        const current = await tasks.get(input.id);
        if (!current) throw new Error("Aufgabe nicht gefunden.");
        const saved = await tasks.put(input.id, { ...current.value, done: !current.value.done }, { expectedRevision: input.expectedRevision });
        await changed();
        return saved;
      },
    });
    ctx.rpc.register("journal", { handler: () => journal.list({ descending: true }) });
    ctx.rpc.register("snapshots", { handler: () => snapshots.list({ descending: true }) });
    ctx.hooks.register("notes.create", "after", async event => {
      const { note } = z.object({ note: z.object({ id: z.string(), title: z.string() }) }).parse(event.result);
      await journal.create({ noteId: note.id, title: note.title });
      await changed();
    });
    ctx.jobs.register("collect", { everyMs: 600_000, runOnActivation: true }, async () => {
      const projects = await ctx.host.call("projects.list");
      await snapshots.create({ projects });
      // Verlauf auf 100 Stände begrenzen.
      const old = await snapshots.list({ descending: true, limit: 1000 });
      for (const row of old.slice(100)) await snapshots.remove(row.id);
      await changed();
    });
    ctx.commands.register("collect", { title: "Projektstände sammeln", handler: () => ctx.jobs.run("collect") });
    ctx.resources.register("tasks", { list: () => tasks.list(), get: input => tasks.get(z.object({ id: z.string() }).parse(input).id) });
    ctx.services.provide("summary", {
      count: defineMethod({ output: z.number(), handler: async () => (await tasks.list({ filter: { done: false }, limit: 1000 })).length }),
    }, { version: "1.0.0" });
  },
});
