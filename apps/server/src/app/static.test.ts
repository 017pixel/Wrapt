import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerStaticHosting, t3LocalNetworkPermissionsPolicy } from "./static.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("statische Workbench-Header", () => {
  it("delegiert lokalen Netzwerkzugriff an die aufgelöste Nightly-Origin", () => {
    const policy = t3LocalNetworkPermissionsPolicy("https://nightly.app.t3.codes/thread");
    expect(policy).toBe(
      'local-network-access=(self "https://nightly.app.t3.codes"), local-network=(self "https://nightly.app.t3.codes"), loopback-network=(self "https://nightly.app.t3.codes")',
    );
    expect(policy).not.toContain('"https://app.t3.codes"');
  });

  it("fällt ohne externen T3-Client auf die Workbench-Origin zurück", () => {
    expect(t3LocalNetworkPermissionsPolicy(null))
      .toBe("local-network-access=(self), local-network=(self), loopback-network=(self)");
  });
});

describe("dynamisches statisches Frontend", () => {
  it("liefert eine verständliche 503-Seite und danach den neuen Build ohne Neustart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-web-dist-"));
    directories.push(directory);
    const app = Fastify();
    await registerStaticHosting(app, null, directory);
    const missing = await app.inject({ url: "/wrapt/", headers: { accept: "text/html" } });
    expect(missing.statusCode).toBe(503);
    expect(missing.body).toContain("restart-frontend.sh");
    writeFileSync(join(directory, "index.html"), "<!doctype html><title>Wrapt</title>");
    const built = await app.inject({ url: "/wrapt/", headers: { accept: "text/html" } });
    expect(built.statusCode).toBe(200);
    expect(built.body).toContain("<title>Wrapt</title>");
    await app.close();
  });

  it("liefert für fehlende Chunks weiterhin 404 statt index.html", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-web-dist-"));
    directories.push(directory);
    writeFileSync(join(directory, "index.html"), "<!doctype html><title>Wrapt</title>");
    const app = Fastify();
    await registerStaticHosting(app, null, directory);
    const chunk = await app.inject({ url: "/wrapt/assets/fehlt.js", headers: { accept: "*/*" } });
    expect(chunk.statusCode).toBe(404);
    await app.close();
  });
});
