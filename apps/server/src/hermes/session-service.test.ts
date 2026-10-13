import { describe, expect, it, vi } from "vitest";
import { HermesSessionService } from "./session-service.js";

describe("Hermes-Session-Service", () => {
  it("startet Referenzen parallel zum HTTP-Read und erhält cwd-Zuordnungen", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    const get = vi.fn(() => pending);
    const projects = vi.fn(async () => [{ id: "known", path: "/projects/known" }]);
    const service = new HermesSessionService({ get } as never, {} as never, projects);
    const listing = service.listSessions({ limit: 10, offset: 0 });
    expect(projects).toHaveBeenCalledOnce();
    release({ sessions: [{ id: "one", cwd: "/projects/known" }, { id: "two", cwd: "/unknown" }] });
    expect((await listing).sessions.map((session) => session.projectId)).toEqual(["known", null]);
    expect((await service.listSessions({ limit: 10, offset: 0, query: "known" })).sessions[0]?.projectId).toBe("known");
    get.mockImplementation(async () => ({ session: { id: "one", working_directory: "/projects/known" } }));
    expect((await service.getSessionSummary("one")).projectId).toBe("known");
  });
  it("normalisiert den realen String-Modellkatalog des Dashboards", async () => {
    const client = {
      get: async (path: string) => path === "/api/model/info"
        ? { model: "custom:active" }
        : { providers: [{ slug: "custom", models: ["active", "alternative"] }] },
      post: async () => null,
    } as never;
    const service = new HermesSessionService(client, { sessionsSnapshot: () => [] } as never);
    const result = await service.models();
    expect(result.current?.id).toBe("custom:active");
    expect(result.models.map((model) => model.id)).toEqual(["custom:active", "custom:alternative"]);
  });
});
