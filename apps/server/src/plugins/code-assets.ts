import { readFileSync, lstatSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PluginCodePlatform } from "./code-platform.js";
import { AppError } from "../utils/errors.js";

export function registerCodePluginAssets(app: FastifyInstance, platform: PluginCodePlatform): void {
  app.get("/plugins/sdk/client.js", async (_request, reply) => reply.type("text/javascript").send(`const host = globalThis[Symbol.for("wrapt.plugin.bridge.v1")];
if (!host) throw new Error("Wrapt Plugin-Bridge fehlt.");
export const z = host.z;
export const defineClientPlugin = value => value;
export const definePlugin = value => value;
export const defineMethod = value => value;
`));
  const reactExports = ["Children", "Component", "Fragment", "Profiler", "PureComponent", "StrictMode", "Suspense", "cache", "cloneElement", "createContext", "createElement", "createRef", "forwardRef", "isValidElement", "lazy", "memo", "startTransition", "use", "useActionState", "useCallback", "useContext", "useDebugValue", "useDeferredValue", "useEffect", "useId", "useImperativeHandle", "useInsertionEffect", "useLayoutEffect", "useMemo", "useOptimistic", "useReducer", "useRef", "useState", "useSyncExternalStore", "useTransition", "version"];
  app.get("/plugins/sdk/react.js", async (_request, reply) => reply.type("text/javascript").send(`const React = globalThis[Symbol.for("wrapt.plugin.bridge.v1")].React;\nexport default React;\n${reactExports.map((name) => `export const ${name} = React.${name};`).join("\n")}`));
  app.get("/plugins/code-assets/:id/:revision/*", async (request, reply) => {
    const params = z.object({ id: z.string(), revision: z.string(), "*": z.string() }).parse(request.params);
    const runtime = platform.runtime.get(params.id);
    if (!runtime || runtime.slot.packageIntegrity !== params.revision) throw new AppError(404, "runtime-unavailable", "Dieser Plugin-Release ist nicht aktiv.");
    const root = join(runtime.slot.packageDirectory, "client");
    const path = resolve(root, params["*"]);
    if (!path.startsWith(`${root}${sep}`) || !/\.(?:js|css)$/.test(path)) throw new AppError(404, "not-found", "Das Plugin-Asset existiert nicht.");
    try {
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error("Keine Datei");
      return reply.header("Cache-Control", "private, max-age=31536000, immutable").header("X-Content-Type-Options", "nosniff").type(path.endsWith(".css") ? "text/css" : "text/javascript").send(readFileSync(path));
    } catch { throw new AppError(404, "not-found", "Das Plugin-Asset existiert nicht."); }
  });
}
