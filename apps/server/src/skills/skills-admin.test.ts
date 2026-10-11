import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { RouteServices } from "../api/services.js";
import {
  allowedUsersIsolationWarning,
  type WorkbenchIdentityOptions,
} from "../security/workbench-identity.js";
import { registerSkillsRoutes } from "./routes.js";

// S-004: Skills-Mutationen erfordern die Adminrolle; Lesen bleibt für alle
// erlaubten Identitäten offen (dokumentiert: keine Mandantentrennung —
// B liest A-Daten, dafür existiert die Mehrbenutzer-Warnung).
const identity: WorkbenchIdentityOptions = {
  allowedUsers: ["admin@example.com", "member@example.com"],
  adminUsers: ["admin@example.com"],
};

const memberHeaders = { "tailscale-user-login": "member@example.com" };
const adminHeaders = { "tailscale-user-login": "admin@example.com" };

const readFileResult = {
  path: "/skills/regeln.md",
  name: "regeln.md",
  content: "Inhalt",
  modifiedAt: new Date().toISOString(),
  sizeBytes: 7,
  revisionToken: "0123456789abcdef",
};
const gitResult = {
  committed: true,
  pushed: false,
  message: null,
  changedSkills: [],
  paths: [],
  errorTail: null,
  notice: null,
};

const skillEditor = {
  status: async () => ({
    rootDirectory: "/skills",
    repositoryConfigured: false,
    repository: null,
    propagationTargets: [],
    autosaveDebounceMs: 1_000,
    maxFileBytes: 1_024,
  }),
  list: async () => ({
    rootDirectory: "/skills",
    agentsFile: null,
    ruleEntries: [],
    skills: [],
    hermesSkills: [],
  }),
  readFile: async () => readFileResult,
  writeFile: async () => readFileResult,
  createSkill: async () => ({ path: "/x", name: "neu", propagated: [], readmeUpdated: false, notice: null }),
  createHermesSkill: async () => ({ path: "/x", name: "neu", propagated: [], readmeUpdated: false, notice: null }),
  renameSkill: async () => ({ renamed: true }),
  renameHermesSkill: async () => ({ renamed: true }),
  deleteSkill: async () => undefined,
  deleteHermesSkill: async () => undefined,
  gitPreview: async () => ({
    branch: "main", changes: [], paths: [], newFiles: [], excludedPaths: [],
    globalRulesChanged: false, diff: "", diffTruncated: false,
    intent: "0123456789abcdef", errorTail: null, notice: null,
  }),
  gitCommit: async () => gitResult,
  gitPush: async () => gitResult,
};

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function skillsApp() {
  const app = Fastify();
  apps.push(app);
  await registerSkillsRoutes(app, { identity, skillEditor } as unknown as RouteServices);
  return app;
}

describe("Skills-Admin-Gate (S-004)", () => {
  it("lässt Lesen für jede erlaubte Identität zu (keine Isolation)", async () => {
    const app = await skillsApp();
    const own = await app.inject({ method: "GET", url: "/skills/status", headers: adminHeaders });
    expect(own.statusCode).toBe(200);
    // Dokumentiertes Verhalten: Zweit-Identität liest dieselben Daten.
    const foreign = await app.inject({ method: "GET", url: "/skills/status", headers: memberHeaders });
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json()).toEqual(own.json());
  });

  const mutations: Array<{ method: "PUT" | "POST" | "DELETE"; url: string; payload?: Record<string, unknown> }> = [
    { method: "PUT", url: "/skills/file", payload: { path: "regeln.md", content: "neu", expectedRevision: null } },
    { method: "POST", url: "/skills", payload: { name: "neu", description: "Beschreibung" } },
    { method: "POST", url: "/skills/hermes", payload: { name: "neu", description: "Beschreibung", category: "kategorie" } },
    { method: "POST", url: "/skills/rename", payload: { name: "alt", newName: "neu" } },
    { method: "DELETE", url: "/skills/alt" },
    { method: "POST", url: "/skills/git/commit", payload: { intent: "0123456789abcdef" } },
    { method: "POST", url: "/skills/git/push" },
  ];
  for (const { method, url, payload } of mutations) {
    it(`blockiert ${method} ${url} für Non-Admin mit 403`, async () => {
      const app = await skillsApp();
      const response = await app.inject({ method, url, headers: memberHeaders, ...(payload === undefined ? {} : { payload }) });
      expect(response.statusCode).toBe(403);
    });
  }

  it("lässt die Admin-Mutation passieren", async () => {
    const app = await skillsApp();
    const response = await app.inject({
      method: "PUT",
      url: "/skills/file",
      headers: adminHeaders,
      payload: { path: "regeln.md", content: "neu", expectedRevision: null },
    });
    expect(response.statusCode).toBe(200);
  });

  it("warnt bei mehreren erlaubten Benutzern vor fehlender Isolation", async () => {
    expect(allowedUsersIsolationWarning(["admin@example.com"])).toBeNull();
    expect(allowedUsersIsolationWarning([])).toBeNull();
    expect(allowedUsersIsolationWarning(["admin@example.com", "member@example.com"])).toMatch(/vertrauensw/);
  });
});
