import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { afterAll, expect, it, vi } from "vitest";
import type { RouteServices } from "../api/services.js";
import { GalleryRepository } from "./galleryRepository.js";
import { registerMediaRoutes } from "./mediaRoutes.js";

const paths = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "wrapt-media-routes-"));
  return { root, databasePath: join(root, "media.sqlite"), legacyMediaDirectory: join(root, "legacy") };
});
vi.mock("../config/settings.js", () => ({ settings: { ...paths, fileGalleryMaxFileBytes: 1_024 } }));
afterAll(() => rm(paths.root, { recursive: true, force: true }));

it("lädt neue Notizmedien hoch und liest historische Medien ohne Quelldaten zu verändern", async () => {
  await mkdir(paths.legacyMediaDirectory);
  const legacyPath = join(paths.legacyMediaDirectory, "alt.png");
  const content = Buffer.from("gespeichertes-notizbild");
  await writeFile(legacyPath, content);
  const digest = createHash("sha256").update(content).digest("hex");
  const assetId = "00000000-0000-4000-8000-000000000001";
  const db = new DatabaseSync(paths.databasePath);
  db.exec(`CREATE TABLE orbit_assets(id TEXT PRIMARY KEY, filename TEXT, mime_type TEXT,
    bytes INTEGER, created_at TEXT, storage_path TEXT);
    CREATE TABLE orbit_documents(id TEXT PRIMARY KEY, document_json TEXT);
    INSERT INTO orbit_documents VALUES('default','{"boards":[{"id":"old"}]}')`);
  db.prepare("INSERT INTO orbit_assets VALUES(?,?,?,?,?,?)")
    .run(assetId, "alt.png", "image/png", content.length, "2026-10-25T00:00:00.000Z", legacyPath);
  const before = db.prepare("SELECT * FROM orbit_assets").all();
  const documentBefore = db.prepare("SELECT * FROM orbit_documents").all();
  const gallery = new GalleryRepository(paths.databasePath, join(paths.root, "gallery"), 1_024, 4_096);
  const app = Fastify();
  try {
    await app.register(multipart);
    await app.register(async (scope) => registerMediaRoutes(scope, { fileGallery: gallery } as unknown as RouteServices), { prefix: "/api/v1" });
    const oldUrl = await app.inject({ method: "GET", url: `/api/v1/orbit/assets/${assetId}` });
    expect(oldUrl.statusCode).toBe(404);
    const legacy = await app.inject({ method: "GET", url: `/api/v1/media/${assetId}` });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.rawPayload).toEqual(content);
    expect(legacy.headers["content-security-policy"]).toBe("sandbox");
    expect(db.prepare("SELECT * FROM orbit_assets").all()).toEqual(before);
    expect(db.prepare("SELECT * FROM orbit_documents").all()).toEqual(documentBefore);
    expect(createHash("sha256").update(readFileSync(legacyPath)).digest("hex")).toBe(digest);

    const uploaded = await app.inject({
      method: "POST", url: "/api/v1/media",
      headers: { "content-type": "multipart/form-data; boundary=wrapt" },
      payload: Buffer.from('--wrapt\r\nContent-Disposition: form-data; name="file"; filename="neu.png"\r\nContent-Type: image/png\r\n\r\nneues-bild\r\n--wrapt--\r\n'),
    });
    expect(uploaded.statusCode).toBe(201);
    const uploadedId = uploaded.json().asset.id as string;
    expect((await app.inject({ method: "GET", url: `/api/v1/media/${uploadedId}` })).body).toBe("neues-bild");
    expect(db.prepare("SELECT COUNT(*) count FROM orbit_assets").get()).toEqual({ count: 1 });
    expect((await app.inject({ method: "GET", url: "/api/v1/orbit" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/v1/orbit/assets" })).statusCode).toBe(404);
  } finally {
    await app.close();
    gallery.close();
    db.close();
  }
});
