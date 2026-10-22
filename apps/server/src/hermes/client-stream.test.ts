import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesDashboardClient, HermesClientError } from "./client.js";

const maximum = 4 * 1024 * 1024;
const client = () => { const value = new HermesDashboardClient(); vi.spyOn(value.token, "get").mockResolvedValue("synthetic-token"); return value; };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Begrenzter Dashboard-Responsestream", () => {
  it.each([undefined, "1", String(maximum)])("bricht echte Streamingübergröße mit Content-Length=%s früh ab", async (length) => {
    let pulls = 0; let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(256 * 1024)); }, cancel() { cancelled = true; } }),
      { headers: length ? { "content-length": length } : {} });
    const buffered = vi.spyOn(response, "arrayBuffer"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(client().get("/api/memory")).rejects.toBeInstanceOf(HermesClientError);
    expect(cancelled).toBe(true); expect(pulls).toBeLessThan(20); expect(buffered).not.toHaveBeenCalled();
  });
  it("weist übergroße deklarierte Antwort vor dem Read ab", async () => {
    let cancelled = false; const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-length": String(maximum + 1) } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response)); await expect(client().get("/api/memory")).rejects.toThrow("zu groß"); expect(cancelled).toBe(true);
  });
  it("erhält UTF8 über Chunkgrenzen, JSONredaction, leere Antworten und Fehlerstatus", async () => {
    const bytes = Buffer.from(JSON.stringify({ text: "ä😀", credentials: { username: "privat" } }));
    const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
    const fetch = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response('{"detail":"Konflikt"}', { status: 409 }));
    vi.stubGlobal("fetch", fetch); const value = client();
    expect(await value.get("/api/memory")).toEqual({ text: "ä😀", credentials: "***" }); expect(await value.delete("/api/cron/jobs/test")).toBe(null);
    await expect(value.post("/api/cron/jobs/test/trigger")).rejects.toMatchObject({ status: 409 }); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("erhält die einmalige explizite Authablehnungswiederholung, ohne unbekannte Sends zu wiederholen", async () => {
    let cancelled = false; const unauthorized = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 401 });
    const fetch = vi.fn().mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(new Response('{"ok":true}')).mockRejectedValueOnce(new Error("Netzverlust"));
    vi.stubGlobal("fetch", fetch); const value = client(); const invalidate = vi.spyOn(value.token, "invalidate");
    expect(await value.post("/api/cron/jobs")).toEqual({ ok: true }); expect(cancelled).toBe(true); expect(invalidate).toHaveBeenCalledTimes(1);
    await expect(value.post("/api/cron/jobs")).rejects.toBeInstanceOf(HermesClientError); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("akzeptiert exakt das Bytebudget und verwirft ungültiges JSON", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify("x".repeat(maximum - 2)))).mockResolvedValueOnce(new Response("{"));
    vi.stubGlobal("fetch", fetch); const value = client(); expect((await value.get("/api/memory") as string).length).toBe(maximum - 2);
    await expect(value.get("/api/memory")).rejects.toThrow("ungültige Daten");
  });
});
