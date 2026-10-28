import { describe, expect, it } from "vitest";
import { DASHBOARD_CONTRIBUTIONS_MAX_COUNT, DASHBOARD_REFRESH_INTERVAL_MAX_MS, DASHBOARD_REFRESH_INTERVAL_MIN_MS, dashboardContributionSchema, dashboardContributionsSchema, dashboardRefreshSchema } from "./contributions.js";


describe("Dashboard Contributions V1", () => {
  const providerContribution = {
    id: "workbench.agent-tasks.dashboard.open-count",
    kind: "metric",
    title: "Offene Aufgaben",
    icon: "workbench.agent-tasks.icon.tasks",
    order: 100,
    provider: "workbench.agent-tasks.dashboard-provider.open-count",
  } as const;

  it("füllt stabile Host-Defaults für providerbasierte Contributions", () => {
    expect(dashboardContributionSchema.parse(providerContribution)).toEqual({
      ...providerContribution,
      defaultSize: "medium",
      projectContext: false,
      visibleByDefault: true,
      refresh: { mode: "on-demand" },
      format: "number",
    });
  });

  it.each([
    { ...providerContribution, kind: "metric", format: "bytes" },
    { ...providerContribution, kind: "status" },
    { ...providerContribution, kind: "card" },
    {
      id: "workbench.agent-tasks.dashboard.create",
      kind: "quick-action",
      title: "Aufgabe erstellen",
      order: 110,
      commandId: "workbench.agent-tasks.command.create",
    },
    { ...providerContribution, kind: "list" },
    { ...providerContribution, kind: "chart", chartType: "line" },
    { ...providerContribution, kind: "error-indicator" },
    { ...providerContribution, kind: "health-indicator" },
  ])("akzeptiert den Dashboard-Typ $kind", (contribution) => {
    expect(dashboardContributionSchema.safeParse(contribution).success).toBe(
      true,
    );
  });

  it("begrenzt Intervalle und verlangt typspezifische Refresh-Felder", () => {
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "interval",
        intervalMilliseconds: DASHBOARD_REFRESH_INTERVAL_MIN_MS,
      }).success,
    ).toBe(true);
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "interval",
        intervalMilliseconds: DASHBOARD_REFRESH_INTERVAL_MAX_MS,
      }).success,
    ).toBe(true);
    expect(dashboardRefreshSchema.safeParse({ mode: "interval" }).success).toBe(
      false,
    );
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "interval",
        intervalMilliseconds: DASHBOARD_REFRESH_INTERVAL_MIN_MS - 1,
      }).success,
    ).toBe(false);
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "realtime",
        intervalMilliseconds: 5_000,
      }).success,
    ).toBe(false);
  });

  it("weist ungültige Format-, Chart- und Quick-Action-Metadaten ab", () => {
    expect(
      dashboardContributionSchema.safeParse({
        ...providerContribution,
        format: "currency",
      }).success,
    ).toBe(false);
    expect(
      dashboardContributionSchema.safeParse({
        ...providerContribution,
        kind: "chart",
        chartType: "scatter",
      }).success,
    ).toBe(false);
    expect(
      dashboardContributionSchema.safeParse({
        id: "workbench.agent-tasks.dashboard.create",
        kind: "quick-action",
        title: "Aufgabe erstellen",
        order: 110,
        commandId: "workbench.agent-tasks.command.create",
        provider: "workbench.agent-tasks.dashboard-provider.create",
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Dashboard-Listen ab", () => {
    expect(dashboardContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      dashboardContributionsSchema.safeParse([
        providerContribution,
        providerContribution,
      ]).success,
    ).toBe(false);
    expect(
      dashboardContributionsSchema.safeParse(
        Array.from(
          { length: DASHBOARD_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...providerContribution,
            id: `workbench.agent-tasks.dashboard.metric-${index}`,
            order: index,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
