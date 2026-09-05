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
      ORBIT_BACKUP_DIR: "/home/tester/.local/share/remote-workplace/orbit-backups",
      WRAPT_PROFILES_ROOT: "/home/tester/.workbench-profiles",
    })).toMatchObject({
      DATABASE_PATH: "/home/tester/.local/share/wrapt/wrapt.sqlite",
      ORBIT_BACKUP_DIR: "/home/tester/.local/share/wrapt/orbit-backups",
      WRAPT_PROFILES_ROOT: "/home/tester/.wrapt-profiles",
    });
  });

  it("hebt die vorherigen lokalen Produktstände auf den aktuellen Stand", () => {
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.95.0" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.96.1" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.97.0" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.98.0" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.99.0" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "0.99.5" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "1.0.0" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "1.0.1" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "1.0.2" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "1.1.0" }).APP_VERSION).toBe("1.5.1");
    expect(canonicalizeWraptEnvironment({ APP_VERSION: "1.1.1" }).APP_VERSION).toBe("1.5.1");
  });
});
