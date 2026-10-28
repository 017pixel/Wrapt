import { describe, expect, it } from "vitest";
import { ROUTE_CONTRIBUTIONS_MAX_COUNT, routeContributionSchema, routeContributionsSchema, routePathCollisionKey, routePathSchema } from "./contributions.js";


describe("Route Contributions V1", () => {
  const route = {
    id: "workbench.agent-tasks.route.main",
    pageId: "workbench.agent-tasks.page.main",
    path: "/agent-tasks",
    aliases: ["/tasks", "/agent-tasks/:taskId"],
  };

  it.each([
    "/",
    "/agent-tasks",
    "/agent-tasks/:taskId",
    "/projects/:projectId/tasks",
  ])("akzeptiert den sicheren Pfad %s", (path) => {
    expect(routePathSchema.parse(path)).toBe(path);
  });

  it.each([
    "agent-tasks",
    "/agent-tasks/",
    "//agent-tasks",
    "/Agent-Tasks",
    "/agent_tasks",
    "/agent-tasks/:task-id",
    "/agent-tasks/:taskId?",
    "/agent-tasks/*",
    "/agent-tasks/../admin",
    "/agent-tasks?view=all",
    "/agent-tasks#main",
    "/agent-tasks%2fadmin",
    "/agent-tasks\\admin",
  ])("weist den unsicheren oder mehrdeutigen Pfad %s ab", (path) => {
    expect(routePathSchema.safeParse(path).success).toBe(false);
  });

  it("normalisiert Parameternamen für Kollisionserkennung", () => {
    expect(routePathCollisionKey("/projects/:projectId")).toBe("/projects/:");
    expect(routePathCollisionKey("/projects/:id")).toBe("/projects/:");
    expect(routePathCollisionKey("/projects/static")).toBe("/projects/static");
    expect(routePathCollisionKey("invalid")).toBeNull();
  });

  it("füllt stabile Host-Defaults für optionale Route-Metadaten", () => {
    expect(routeContributionSchema.parse(route)).toEqual({
      ...route,
      shell: "standard",
      persistent: false,
      prefetch: "none",
      projectContext: false,
      topbar: true,
      breadcrumbs: true,
      standaloneActions: false,
      mobileNavigation: false,
    });
  });

  it("akzeptiert die vollständigen Dynamic-Shell-Metadaten", () => {
    expect(
      routeContributionSchema.safeParse({
        ...route,
        title: "Agent Tasks",
        shell: "full-bleed",
        persistent: true,
        prefetch: "idle",
        projectContext: true,
        topbar: false,
        breadcrumbs: false,
        standaloneActions: true,
        mobileNavigation: true,
      }).success,
    ).toBe(true);
  });

  it("weist unbekannte Metadaten und Kollisionen zwischen Hauptpfad und Alias ab", () => {
    expect(
      routeContributionSchema.safeParse({ ...route, layout: "custom" }).success,
    ).toBe(false);
    expect(
      routeContributionSchema.safeParse({
        ...route,
        aliases: ["/agent-tasks/:id", "/agent-tasks/:taskId"],
      }).success,
    ).toBe(false);
    expect(
      routeContributionSchema.safeParse({
        ...route,
        path: "/agent-tasks/:id",
        aliases: ["/agent-tasks/:taskId"],
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und kollidierende URL-Muster über Routes hinweg ab", () => {
    expect(
      routeContributionsSchema.safeParse([route, { ...route, path: "/other" }])
        .success,
    ).toBe(false);
    expect(
      routeContributionsSchema.safeParse([
        route,
        {
          ...route,
          id: "workbench.agent-tasks.route.detail",
          path: "/projects/:id",
          aliases: ["/other"],
        },
        {
          ...route,
          id: "workbench.agent-tasks.route.alternative",
          path: "/projects/:projectId",
          aliases: ["/another"],
        },
      ]).success,
    ).toBe(false);
  });

  it("begrenzt die Zahl deklarierter Routes", () => {
    expect(
      routeContributionsSchema.safeParse(
        Array.from(
          { length: ROUTE_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            id: `workbench.agent-tasks.route.route-${index}`,
            pageId: "workbench.agent-tasks.page.main",
            path: `/route-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
