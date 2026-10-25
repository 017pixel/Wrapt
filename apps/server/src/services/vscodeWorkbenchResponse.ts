import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { FastifyReply, RawServerBase, RouteGenericInterface } from "fastify";
import { settings } from "../config/settings.js";
import { injectShortcutBridge } from "./shortcutBridge.js";
import { createVSCodeWorkbenchConfigurator } from "./vscodeWorkbench.js";

const configureWorkbench = createVSCodeWorkbenchConfigurator(settings.vscodeWebDataDirectory);

export async function sendVSCodeWorkbenchResponse(reply: FastifyReply<RouteGenericInterface, RawServerBase>, upstream: {
  headers: IncomingHttpHeaders; stream: Readable;
}) {
  const type = upstream.headers["content-type"];
  if (typeof type !== "string" || !type.toLowerCase().includes("text/html") || upstream.headers["content-encoding"]) {
    return reply.send(upstream.stream);
  }
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of upstream.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > settings.editorHtmlMaxBytes) {
        for (const header of ["content-length", "etag"]) reply.removeHeader(header);
        return reply.status(502).type("text/plain").send("Das VS-Code-Startdokument ist zu groß.");
      }
      chunks.push(buffer);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    const workbench = await configureWorkbench(html);
    const csp = upstream.headers["content-security-policy"];
    const nonce = typeof csp === "string" ? /'nonce-([^']+)'/.exec(csp)?.[1] : undefined;
    const configured = workbench.includes("vscode-workbench-web-configuration") || workbench.includes("code-server")
      ? injectShortcutBridge(workbench, nonce) : workbench;
    if (configured !== html) {
      for (const header of ["content-length", "etag", "last-modified"]) reply.removeHeader(header);
      reply.header("cache-control", "no-store");
    }
    return reply.send(configured);
  } catch {
    if (!reply.sent) {
      for (const header of ["content-length", "etag"]) reply.removeHeader(header);
      return reply.status(502).type("text/plain").send("Das VS-Code-Startdokument konnte nicht geladen werden.");
    }
  }
}
