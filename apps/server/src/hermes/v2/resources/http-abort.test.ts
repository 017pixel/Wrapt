import { afterEach, describe, expect, it, vi } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

function deferred() { let resolve = () => {}; const promise = new Promise<void>((done) => { resolve = done; }); return { resolve, promise }; }
describe("Ressourcenrequestlebensdauer", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>> | undefined;
  afterEach(async () => { vi.restoreAllMocks(); await f?.close(); });
  it("sendet nach echtem HTTPabbruch während des frischen Profilawaits keine Mutation", async () => {
    f = await resourceFixture(); const fixture = f; const scope = await f.scope(); const held = deferred(); const release = deferred(); const closed = deferred(); let blocked = false;
    const origin = await f.app.listen({ host: "127.0.0.1", port: 0 });
    f.app.server.on("request", (_request, response) => { response.once("close", closed.resolve); });
    const host = f.pool.resources!; const original = host.context.bind(host); let captured: ReturnType<typeof host.context> | undefined;
    vi.spyOn(host, "context").mockImplementation((...args) => { captured = original(...args); void captured.catch(() => {}); return captured; });
    f.hook(async (_method, path) => { if (!blocked && path === "/api/profiles/active") { blocked = true; held.resolve(); await release.promise; } });
    const controller = new AbortController();
    const request = fetch(`${origin}/api/v1/hermes/v2/cron/jobs/job-1/pause`, { method: "POST", signal: controller.signal, headers: { origin, "tailscale-user-login": "a", "content-type": "application/json" }, body: JSON.stringify({ scope }) }).catch(() => null);
    try { await held.promise; controller.abort(); await request; await closed.promise; }
    finally { release.resolve(); }
    await expect(captured!).rejects.toMatchObject({ code: "FORBIDDEN", outcome: "not_sent" });
    expect(fixture.writes).toHaveLength(0);
  });
});
