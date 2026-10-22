import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../utils/errors.js";

export function registerPluginDocs(app: FastifyInstance, repositoryRoot: string): void {
  const root = join(repositoryRoot, "docs/extensions/plugin-platform");
  app.get("/plugins/docs", async () => ({ root: "/api/v1/plugins/docs/", files: readdirSync(root).filter((name) => name.endsWith(".md")).sort() }));
  app.get("/plugins/docs/*", async (request, reply) => {
    const { "*": name } = z.object({ "*": z.string().min(1) }).parse(request.params);
    const path = resolve(root, name);
    if (!path.startsWith(`${root}${sep}`) || !/\.(?:md|tsx?|json)$/.test(path)) throw new AppError(404, "not-found", "Die Plugin-Referenz existiert nicht.");
    try {
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error("Keine Referenzdatei");
      return reply.type("text/plain; charset=utf-8").send(readFileSync(path, "utf8"));
    } catch { throw new AppError(404, "not-found", "Die Plugin-Referenz existiert nicht."); }
  });
}
