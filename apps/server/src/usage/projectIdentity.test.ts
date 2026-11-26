import { afterEach, describe, expect, it } from "vitest";
import { UsageDatabase } from "./database.js";

const databases: UsageDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("Projektidentität in der Nutzung", () => {
  it("vermischt zwei Projekte mit gleichem Ordnernamen nicht", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    database.importCost([
      { provider: "codex", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/kunde-a/web", name: "web", totalTokens: 100, totalCost: 1.0 }], daily: [] },
      { provider: "opencode", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/kunde-b/web", name: "web", totalTokens: 50, totalCost: 0.5 }], daily: [] },
    ]);
    const projects = database.dashboard("365d").projects;
    expect(projects).toHaveLength(2);
    expect(projects.map((project) => project.label).sort()).toEqual(["kunde-a/web", "kunde-b/web"]);
    expect(projects.map((project) => project.totalTokens).sort((a, b) => a - b)).toEqual([50, 100]);
  });

  it("führt denselben Pfad über Provider hinweg weiterhin zusammen", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    database.importCost([
      { provider: "codex", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/pfad/Wrapt", name: "Wrapt", totalTokens: 100, totalCost: 1.0 }], daily: [] },
      { provider: "opencode", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/pfad/Wrapt", name: "Wrapt", totalTokens: 50, totalCost: 0.5 }], daily: [] },
    ]);
    expect(database.dashboard("365d").projects).toMatchObject([{ label: "Wrapt", totalTokens: 150 }]);
  });
});
