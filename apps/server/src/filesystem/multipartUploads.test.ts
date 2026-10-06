import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { OrbitAssetRepository } from "../orbit/assets.js";
import { AppError } from "../utils/errors.js";
import { FileManagerService } from "./fileManagerService.js";

it.each(["Archiv", "Dateimanager"])("veröffentlicht keine vom Multipart-Parser abgeschnittene Datei (%s)", async (kind) => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-upload-limit-"));
  const directory = join(root, "files");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(directory);
  const assets = new OrbitAssetRepository(join(root, "assets.sqlite"), directory, 5, 100);
  const files = new FileManagerService(directory, 100, 5, join(root, "files.sqlite"));
  const app = Fastify();
  try {
    await app.register(multipart, { limits: { fileSize: 5 } });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) return reply.status(error.statusCode).send({ code: error.code });
      return reply.send(error);
    });
    app.post("/upload", async (request, reply) => {
      const upload = await request.file();
      if (!upload) throw new Error("Upload fehlt");
      const result = kind === "Archiv"
        ? await assets.createStream({ filename: upload.filename, mimeType: upload.mimetype, stream: upload.file })
        : await files.upload({ directory, filename: upload.filename, stream: upload.file });
      return reply.status(201).send(result);
    });
    const response = await app.inject({
      method: "POST", url: "/upload",
      headers: { "content-type": "multipart/form-data; boundary=wrapt" },
      payload: Buffer.from('--wrapt\r\nContent-Disposition: form-data; name="file"; filename="bericht.txt"\r\nContent-Type: text/plain\r\n\r\n123456789\r\n--wrapt--\r\n'),
    });
    expect(response.statusCode).toBe(413);
    expect(await readdir(directory)).toEqual([]);
    expect(assets.list(10, null).assets).toEqual([]);
  } finally {
    await app.close();
    assets.close();
    files.close();
    await rm(root, { recursive: true, force: true });
  }
});
