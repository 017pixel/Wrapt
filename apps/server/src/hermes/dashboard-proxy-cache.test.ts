import { constants as zlibConstants } from "node:zlib";
import type { IncomingHttpHeaders } from "node:http";
import http from "node:http";
import Fastify, { type FastifyInstance } from "fastify";
import compress from "@fastify/compress";
import replyFrom from "@fastify/reply-from";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rewriteResponseHeaders } from "./dashboard-proxy.js";

/**
 * `rewriteResponseHeaders` liefert JavaScript als `immutable` aus, damit der
 * Browser es nicht bei jedem Öffnen des Hermes-Fensters neu lädt. Das ist nur
 * zulässig, solange die Kompression dazugehörig `Vary: Accept-Encoding` setzt:
 * ohne ihn würde ein Cache brotli-komprimierte Bytes an einen Client ausliefern,
 * der sie nicht dekodieren kann. Dieser Test fährt den echten Fastify-Stack mit
 * derselben Kompressionskonfiguration wie `app/plugins.ts` gegen einen
 * Mini-Upstream.
 */

const assetBody = `const deps=["assets/a.js"];${"x".repeat(200_000)}`;

let upstream: http.Server;
let upstreamPort = 0;
let app: FastifyInstance;

beforeAll(async () => {
  upstream = http.createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(Buffer.byteLength(assetBody)),
    });
    response.end(assetBody);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
  upstreamPort = (upstream.address() as { port: number }).port;

  app = Fastify();
  await app.register(replyFrom);
  await app.register(compress, {
    global: true,
    globalDecompression: false,
    threshold: 1024,
    encodings: ["br", "gzip"],
    brotliOptions: { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } },
  });
  app.get("/hermes/*", async (request, reply) => {
    const resourcePath = (request as { url: string }).url;
    return reply.from(`http://127.0.0.1:${upstreamPort}/assets/index-BqKNhaVF.js`, {
      rewriteRequestHeaders: () => ({ "accept-encoding": "identity" }),
      rewriteHeaders: (headers: IncomingHttpHeaders) => rewriteResponseHeaders(headers, "/hermes", { method: "GET", resourcePath }),
      onResponse: (_request: unknown, response: unknown, rawResponse: unknown) => {
        const stream = (rawResponse as { stream: NodeJS.ReadableStream }).stream;
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          const proxied = response as { removeHeader: (name: string) => void; type: (value: string) => { send: (body: string) => void } };
          proxied.removeHeader("content-length");
          proxied.removeHeader("content-encoding");
          proxied.type("text/javascript; charset=utf-8").send(Buffer.concat(chunks).toString("utf8"));
        });
      },
    } as never);
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("Hermes-Proxy: Cache-Header im Zusammenspiel mit Kompression", () => {
  it("kennzeichnet komprimiertes JavaScript als immutable und nennt die Kodierung", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/hermes/assets/index-BqKNhaVF.js?rw=3",
      headers: { "accept-encoding": "br, gzip" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.headers["content-encoding"]).toBe("br");
    expect(String(response.headers.vary).toLowerCase()).toContain("accept-encoding");
    expect(response.rawPayload.length).toBeLessThan(1_000);
  });

  it("liefert an Clients ohne Kodierung den vollständigen Inhalt", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/hermes/assets/index-BqKNhaVF.js?rw=3",
      headers: { "accept-encoding": "identity" },
    });
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.body).toContain("const deps=");
    expect(response.body.length).toBeGreaterThan(200_000);
  });
});
