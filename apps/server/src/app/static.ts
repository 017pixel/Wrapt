import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import { apiErrorSchema } from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function t3LocalNetworkPermissionsPolicy(t3ClientUrl: string | null): string {
  const allowlist = t3ClientUrl === null ? "self" : `self "${new URL(t3ClientUrl).origin}"`;
  return ["local-network-access", "local-network", "loopback-network"]
    .map((feature) => `${feature}=(${allowlist})`)
    .join(", ");
}

/**
 * Statisches Frontend. Das Verzeichnis wird beim Start angelegt und die Route
 * immer registriert: Ein späterer Frontend-Build wird dadurch ohne
 * Serverneustart ausgeliefert. Fehlt `index.html`, antwortet der Server mit
 * einer klaren 503-Seite statt mit einem dauerhaften 404.
 */
export async function registerStaticHosting(
  app: FastifyInstance,
  t3ClientUrl: string | null,
  webDistDirectory: string = settings.webDistDirectory,
) {
  await mkdir(webDistDirectory, { recursive: true }).catch(() => undefined);
  const indexPath = join(webDistDirectory, "index.html");
  const permissionsPolicy = t3LocalNetworkPermissionsPolicy(t3ClientUrl);
  await app.register(fastifyStatic, {
    root: webDistDirectory,
    prefix: "/wrapt/",
    preCompressed: true,
    index: ["index.html"],
    setHeaders: (response, filePath) => {
      if (filePath.includes("/assets/")) {
        response.header("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
        response.header("Cache-Control", "no-cache");
        // Das gehostete T3-Web-UI wird als Iframe eingebettet und
        // verbindet sich per Private Network Access mit den T3-Backends im
        // Tailnet. Chrome verlangt dafür eine einmalige Bestätigung des
        // lokalen Netzwerkzugriffs (local-network-access), Firefox nutzt die
        // Feature-Policy-Namen local-network/loopback-network. Beide Welten
        // werden an den Iframe delegiert.
        response.header(
          "Permissions-Policy",
          permissionsPolicy,
        );
        return;
      }
      if (filePath.includes("/icons/") || filePath.endsWith("favicon.svg")) {
        response.header("Cache-Control", "public, max-age=604800");
      }
    },
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send(
        apiErrorSchema.parse({ error: { code: "NOT_FOUND", message: "Der API-Endpunkt wurde nicht gefunden.", details: null, requestId: request.id, retryable: false } }),
      );
    }
    const legacyUrl = new URL(request.url, "http://wrapt.local");
    if (legacyUrl.pathname === "/workbench" || legacyUrl.pathname.startsWith("/workbench/")) {
      const suffix = legacyUrl.pathname.slice("/workbench".length) || "/";
      return reply.status(308).redirect(`/wrapt${suffix}${legacyUrl.search}`);
    }
    // Erst im Request prüfen: Nach einem Build greift das Frontend sofort,
    // ohne dass der Server neu starten muss.
    const hasWebBuild = await fileExists(indexPath);
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    if (hasWebBuild && request.url.startsWith("/wrapt") && acceptsHtml) {
      return reply
        .header("Permissions-Policy", permissionsPolicy)
        .type("text/html")
        .sendFile("index.html");
    }
    if (hasWebBuild) return reply.status(404).send("Nicht gefunden.");
    const message = "Frontend-Build fehlt. Bitte `bash scripts/restart-frontend.sh` ausführen; die Workbench wird danach ohne Dienstneustart ausgeliefert.";
    if (!acceptsHtml) return reply.status(503).type("text/plain; charset=utf-8").send(message);
    return reply.status(503).type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wrapt – Frontend wird gebaut</title></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;display:grid;place-items:center;min-height:100vh">
<main style="max-width:32rem;padding:2rem"><h1 style="font-size:1.25rem;margin:0 0 .75rem">Frontend-Build fehlt</h1>
<p style="line-height:1.6;color:#a3a3a3">Die Workbench läuft, aber <code>apps/web/dist</code> enthält noch kein <code>index.html</code>. Führe <code>bash scripts/restart-frontend.sh</code> aus und lade diese Seite dann neu.</p></main>
</body></html>`);
  });
}
