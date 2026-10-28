import { describe, expect, it } from "vitest";
import { PAGE_CONTRIBUTIONS_MAX_COUNT, pageContributionsSchema } from "./contributions.js";


describe("Page Contributions V1", () => {
  it("akzeptiert Renderflächen mit stabiler ID und Anzeigemetadaten", () => {
    const page = {
      id: "workbench.agent-tasks.page.main",
      title: "Agent Tasks",
      description: "Aufgaben und Agent Runs verwalten.",
    };
    expect(pageContributionsSchema.parse([page])).toEqual([page]);
  });

  it("weist leere, doppelte und übergroße Page-Listen ab", () => {
    const page = {
      id: "workbench.agent-tasks.page.main",
      title: "Agent Tasks",
    };
    expect(pageContributionsSchema.safeParse([]).success).toBe(false);
    expect(pageContributionsSchema.safeParse([page, page]).success).toBe(false);
    expect(
      pageContributionsSchema.safeParse(
        Array.from(
          { length: PAGE_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            id: `workbench.agent-tasks.page.page-${index}`,
            title: `Page ${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
