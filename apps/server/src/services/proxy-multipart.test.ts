import { createServer, type Server } from "node:http";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import replyFrom from "@fastify/reply-from";
import { afterEach, describe, expect, it } from "vitest";

const apps: ReturnType<typeof Fastify>[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (address === null || typeof address === "string") return reject(new Error("Upstream-Port fehlt."));
      resolve(address.port);
    });
  });
}

describe("Proxy-Multipart-Roundtrip", () => {
  it("reicht multipart/form-data bytegenau durch reply-from weiter", async () => {
    let received: Buffer | undefined;
    const upstream = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = Buffer.concat(chunks);
        response.writeHead(204);
        response.end();
      });
    });
    servers.push(upstream);
    const port = await listen(upstream);
    const app = Fastify({ logger: { level: "silent" } });
    apps.push(app);
    await app.register(async (scope) => {
      scope.addContentTypeParser("multipart/form-data", { parseAs: "buffer" }, (_request, value, done) => done(null, value));
      await scope.register(replyFrom);
      scope.all("/proxy", async (_request, reply) => reply.from(`http://127.0.0.1:${port}/upload`));
    });
    await app.register(async (scope) => {
      await scope.register(multipart, { limits: { files: 1, fileSize: 1024 * 1024 } });
      scope.post("/upload", async (request) => request.file());
    });
    await app.ready();

    const boundary = "----wrapt-multipart-boundary";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.txt"\r\nContent-Type: text/plain\r\n\r\nBytegenauer Inhalt\r\n--${boundary}--\r\n`,
      "utf8",
    );
    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(204);
    expect(received).toEqual(body);
  });
});
