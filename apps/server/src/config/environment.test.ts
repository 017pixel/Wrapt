import { describe, expect, it } from "vitest";
import { canonicalizeWraptEnvironment } from "./environment.js";

describe("Wrapt-Umgebungsvariablen", () => {
  it("liest den alten Namen nur als Fallback", () => {
    expect(canonicalizeWraptEnvironment({ WORKBENCH_PROFILES_ROOT: "/legacy" }).WRAPT_PROFILES_ROOT).toBe("/legacy");
  });

  it("bevorzugt den neuen Namen bei gleichzeitig gesetzten Variablen", () => {
    expect(canonicalizeWraptEnvironment({ WRAPT_PROFILES_ROOT: "/wrapt", WORKBENCH_PROFILES_ROOT: "/legacy" }).WRAPT_PROFILES_ROOT).toBe("/wrapt");
  });

  it("normalisiert alte persönliche Pfad-Overrides ohne Secrets zu lesen oder zu loggen", () => {
    expect(canonicalizeWraptEnvironment({
      DATABASE_PATH: "/home/tester/.local/share/remote-workplace/workbench.sqlite",
      FILE_GALLERY_DIR: "/home/tester/.local/share/remote-workplace/file-gallery",
      WRAPT_PROFILES_ROOT: "/home/tester/.workbench-profiles",
    })).toMatchObject({
      DATABASE_PATH: "/home/tester/.local/share/wrapt/wrapt.sqlite",
      FILE_GALLERY_DIR: "/home/tester/.local/share/wrapt/file-gallery",
      WRAPT_PROFILES_ROOT: "/home/tester/.wrapt-profiles",
    });
  });

  it("übernimmt bestehende Projektbrowser-Grenzen und bevorzugt neue Variablen", () => {
    const legacy = { ORBIT_PROJECT_BROWSER_ROOT: "/bestehend", ORBIT_PROJECT_BROWSER_PAGE_SIZE: "120", ORBIT_RECENT_PROJECT_LIMIT: "5" };
    expect(canonicalizeWraptEnvironment(legacy)).toMatchObject({ PROJECT_BROWSER_ROOT: "/bestehend", PROJECT_BROWSER_PAGE_SIZE: "120", RECENT_PROJECT_LIMIT: "5" });
    expect(canonicalizeWraptEnvironment({ ...legacy, PROJECT_BROWSER_ROOT: "/neu", PROJECT_BROWSER_PAGE_SIZE: "90", RECENT_PROJECT_LIMIT: "7" }))
      .toMatchObject({ PROJECT_BROWSER_ROOT: "/neu", PROJECT_BROWSER_PAGE_SIZE: "90", RECENT_PROJECT_LIMIT: "7" });
  });

  it("reicht unbekannte Variablen unverändert durch", () => {
    // Die Produktversion kommt aus package.json; eine gesetzte APP_VERSION wird nicht mehr umgeschrieben.
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.95.0" }).APP_VERSION).toBe("0.95.0");
  });
});
