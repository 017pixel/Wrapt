import { describe, expect, it, vi } from "vitest";
import { ResourceClient } from "./resource-client";
import { cronFields, cronJob, heldResource, jsonResource, resourceRejection, resourceScope, resourceText, skillsData } from "./resource-test-fixtures";
import { resourcePolicy } from "./resource-policy";

const signal = () => new AbortController().signal;
describe("Ressourcen-HTTPvertrag und ehrliche Quittungen", () => {
  it("sendet sichere Cronfelder mit echter Slugprojekt-ID und vorhandenen Authkonventionen", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource({ scope: resourceScope, outcome: "confirmed", operation: "create", jobId: "new", job: cronJob("new") }));
    await new ResourceClient(fetcher).cronCreate(resourceScope, cronFields, signal());
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, init] = fetcher.mock.calls[0]!;
    expect(path).toBe("/api/v1/hermes/v2/cron/jobs");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", headers: { "X-Wrapt-Sync-Version": "2" } });
    expect(JSON.parse(String(init?.body))).toEqual({ ...cronFields, scope: resourceScope });
  });
  it("serialisiert beim Edit nur sichere Updates und keinen Nativezusatz zurück", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource({ scope: resourceScope, outcome: "confirmed", operation: "update", jobId: "a", job: cronJob("a") }));
    await new ResourceClient(fetcher).cronUpdate(resourceScope, "a", { prompt: "Neu" }, signal());
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ scope: resourceScope, updates: { prompt: "Neu" } });
    await expect(new ResourceClient(fetcher).cronUpdate(resourceScope, "a", { additional: [] } as never, signal())).rejects.toMatchObject({ info: { outcome: "not_sent" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["operation", "jobId", "job", "scope"])("bestätigt keine falsche Cronkorrelation: %s", async (field) => {
    const receipt = { scope: resourceScope, operation: "pause", jobId: "a", job: cronJob("a"), outcome: "confirmed" };
    const value = { ...receipt, [field]: field === "operation" ? "resume" : field === "job" ? cronJob("other") : field === "scope" ? "b".repeat(64) : "other" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource(value));
    await expect(new ResourceClient(fetcher).cronAction(resourceScope, "a", "pause", signal())).rejects.toMatchObject({ info: { code: "PROTOCOL_MISMATCH", outcome: "unknown" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("akzeptiert einen bestätigten Trigger mit job:null und exakter ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource({ scope: resourceScope, operation: "trigger", jobId: "one", job: null, outcome: "confirmed" }));
    expect(await new ResourceClient(fetcher).cronAction(resourceScope, "one", "trigger", signal())).toMatchObject({ operation: "trigger", jobId: "one", job: null });
  });
  it("fordert beim Create eine konkrete bestätigte neue Identität", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource({ scope: resourceScope, operation: "create", jobId: "new", job: null, outcome: "confirmed" }));
    await expect(new ResourceClient(fetcher).cronCreate(resourceScope, cronFields, signal())).rejects.toMatchObject({ info: { outcome: "unknown" } });
  });
  it.each([401, 409, 503])("erhält eine validierte definitive Ablehnung bei HTTP%s ohne Retry", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(resourceRejection("NATIVE_CONFLICT", "rejected", status));
    await expect(new ResourceClient(fetcher).cronAction(resourceScope, "a", "pause", signal())).rejects.toMatchObject({ info: { status, outcome: "rejected", retryable: false } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["bad-json", "malformed-error", "network"])("finalisiert %s nach Send unknown und wiederholt nicht", async (kind) => {
    const fetcher = vi.fn<typeof fetch>();
    if (kind === "network") fetcher.mockRejectedValue(new Error("privater Rohfehler"));
    else fetcher.mockResolvedValue(kind === "bad-json" ? new Response("broken") : jsonResource({ message: "unbelegt" }, 401));
    await expect(new ResourceClient(fetcher).cronAction(resourceScope, "a", "pause", signal())).rejects.toMatchObject({ info: { outcome: "unknown" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("sendet bei bereits abgebrochenem Signal nichts", async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(new ResourceClient(fetcher).cronAction(resourceScope, "a", "pause", controller.signal)).rejects.toMatchObject({ info: { outcome: "not_sent" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("beendet auch einen Fetchmock, der Abort ignoriert, ohne automatische Mutation", async () => {
    const held = heldResource<Response>(), controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(held.promise);
    const request = new ResourceClient(fetcher).cronAction(resourceScope, "a", "pause", controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ info: { outcome: "unknown" } });
    held.resolve(jsonResource({})); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("beendet einen blockierten Bodyreader am Deadline und hält Speicher begrenzt", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ start() {} })));
      const request = new ResourceClient(fetcher).cronList(signal());
      const rejected = expect(request).rejects.toMatchObject({ info: { outcome: "not_sent" } });
      await vi.advanceTimersByTimeAsync(resourcePolicy.requestTimeoutMs); await rejected;
    } finally { vi.useRealTimers(); }
  });
  it("verwirft einen zu großen gestreamten Body vor JSON und Pufferausbau", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(resourcePolicy.maxResponseBytes + 1)));
    await expect(new ResourceClient(fetcher).cronAction(resourceScope, "a", "pause", signal())).rejects.toMatchObject({ info: { outcome: "unknown" } });
  });
  it("liest Skillcontent mit exaktem Querynamen und prüft den zurückgegebenen Namen", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource({ scope: resourceScope, skill: { ...skillsData().skills[0], name: "a /?ä" }, content: resourceText(), editorPath: "/ki-skills" }));
    await new ResourceClient(fetcher).skillDetail("a /?ä", signal());
    const url = new URL(String(fetcher.mock.calls[0]![0]), "https://wrapt.test");
    expect(url.pathname).toBe("/api/v1/hermes/v2/skills/detail"); expect(url.searchParams.get("name")).toBe("a /?ä");
    await expect(new ResourceClient(fetcher).skillDetail("other", signal())).rejects.toMatchObject({ info: { code: "PROTOCOL_MISMATCH" } });
  });
  it.each(["id", "absence", "duplicate", "scope"])("bereinigt keine unpassende Deletequittung: %s", async (kind) => {
    const result = { scope: kind === "scope" ? "b".repeat(64) : resourceScope, outcome: "confirmed", requestedSessionId: kind === "id" ? "other" : "full-id",
      alreadyAbsent: false, confirmedAbsentSessionIds: kind === "absence" ? ["other"] : kind === "duplicate" ? ["full-id", "full-id"] : ["full-id"], affectedIdsComplete: false, effect: "compression-chain" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResource(result));
    await expect(new ResourceClient(fetcher).sessionDelete(resourceScope, "full-id", signal())).rejects.toMatchObject({ info: { outcome: "unknown" } });
  });
});
