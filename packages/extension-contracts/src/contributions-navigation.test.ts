import { describe, expect, it } from "vitest";
import { NAVIGATION_CONTRIBUTIONS_MAX_COUNT, navigationContributionSchema, navigationContributionsSchema } from "./contributions.js";


describe("Navigation Contributions V1", () => {
  const navigation = {
    id: "workbench.agent-tasks.navigation.main",
    routeId: "workbench.agent-tasks.route.main",
    label: "Agent Tasks",
    description: "Aufgaben und Agent Runs verwalten.",
    icon: "workbench.agent-tasks.icon.main",
    group: "tools",
    order: 120,
    badgeProvider: "workbench.agent-tasks.badge.open-tasks",
  } as const;

  it("akzeptiert gemeinsame Desktop- und Mobile-Metadaten mit stabilen Defaults", () => {
    expect(navigationContributionSchema.parse(navigation)).toEqual({
      ...navigation,
      visibleByDefault: true,
    });
    expect(
      navigationContributionSchema.safeParse({
        ...navigation,
        icon: "extension",
        group: "extensions",
        visibleByDefault: false,
      }).success,
    ).toBe(true);
  });

  it("weist unbekannte Gruppen, ungültige Reihenfolgen und ausführbare Felder ab", () => {
    expect(
      navigationContributionSchema.safeParse({
        ...navigation,
        group: "marketplace",
      }).success,
    ).toBe(false);
    expect(
      navigationContributionSchema.safeParse({ ...navigation, order: -1 })
        .success,
    ).toBe(false);
    expect(
      navigationContributionSchema.safeParse({ ...navigation, order: 1.5 })
        .success,
    ).toBe(false);
    expect(
      navigationContributionSchema.safeParse({
        ...navigation,
        badgeProvider: () => 3,
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Navigation-Listen ab", () => {
    expect(navigationContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      navigationContributionsSchema.safeParse([navigation, navigation]).success,
    ).toBe(false);
    expect(
      navigationContributionsSchema.safeParse(
        Array.from(
          { length: NAVIGATION_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...navigation,
            id: `workbench.agent-tasks.navigation.item-${index}`,
            order: index,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
