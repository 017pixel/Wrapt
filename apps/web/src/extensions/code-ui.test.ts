import { afterEach, describe, expect, it } from "vitest";
import { CodePluginUiRegistry, codePluginUi } from "./code-ui";
import { resolveCodePageRoutes } from "./code-routes";
import { resolveCodeNavigation } from "./code-navigation";

afterEach(() => codePluginUi.removeOwner("personal.test"));

describe("Code-Plugin-Oberflächen", () => {
  it("wendet Transformationen deterministisch an und stellt nach Dispose Originale wieder her", () => {
    const ui = new CodePluginUiRegistry();
    const builtin = [{ id: "wrapt.terminal.navigation.main", surface: "navigation" as const, title: "Terminal", path: "/terminal" }];
    const later = ui.transform("personal.z", "navigation", (editor) => editor.update(builtin[0]!.id, { title: `${editor.get(builtin[0]!.id)!.title} Z` }));
    ui.transform("personal.a", "navigation", (editor) => editor.update(builtin[0]!.id, { title: "Meine Shell" }));
    expect(ui.resolve("navigation", builtin)[0]?.title).toBe("Meine Shell Z");
    later.dispose();
    expect(ui.resolve("navigation", builtin)[0]?.title).toBe("Meine Shell");
    ui.removeOwner("personal.a");
    expect(ui.resolve("navigation", builtin)).toEqual(builtin);
    expect(builtin[0]?.title).toBe("Terminal");
  });

  it("verwirft fehlerhafte Änderungen einschließlich bereits vorgenommener Hide-Aktionen", () => {
    const ui = new CodePluginUiRegistry();
    const builtin = [{ id: "wrapt.notes.page.main", surface: "page" as const, title: "Notizen", path: "/notizen" }];
    ui.transform("personal.test", "page", (editor) => { editor.hide(builtin[0]!.id); editor.update(builtin[0]!.id, { path: "/ungültig.mit.punkt" }); });
    expect(ui.resolve("page", builtin)).toEqual(builtin);
  });

  it("weist fremde IDs, ungültige Pfade und doppelte persönliche Routen an der Grenze zurück", () => {
    const ui = new CodePluginUiRegistry();
    expect(() => ui.register("personal.test", { id: "wrapt.notes.page.main", surface: "page", title: "Fremd" })).toThrow("Namensraum");
    expect(() => ui.register("personal.test", { id: "personal.test.page.main", surface: "page", title: "Kaputt", path: "/plugins/app/personal.test" })).toThrow("lokale Routen");
    ui.register("personal.test", { id: "personal.test.page.main", surface: "page", title: "Gut", path: "/plugins/app/personal/test" });
    expect(() => ui.register("personal.other", { id: "personal.other.page.main", surface: "page", title: "Kollision", path: "/plugins/app/personal/test" })).toThrow("bereits registriert");
  });

  it("verbindet persönliche React-Seiten und Navigation und entfernt beides nach dem Entladen", () => {
    const path = "/plugins/app/personal/test";
    codePluginUi.register("personal.test", { id: "personal.test.page.main", surface: "page", title: "Meine App", path, Component: () => null });
    codePluginUi.register("personal.test", { id: "personal.test.navigation.main", surface: "navigation", title: "Meine App", path });
    const empty = { revision: 0, pages: [], routes: [] };
    expect(resolveCodePageRoutes(empty).routes[0]?.value.contribution.path).toBe(path);
    expect(resolveCodeNavigation({ revision: 0, items: [], byGroup: { workspace: [], tools: [], extensions: [], account: [], system: [] } }).items[0]?.value.route.path).toBe(path);
    codePluginUi.removeOwner("personal.test");
    expect(resolveCodePageRoutes(empty)).toEqual(empty);
  });
});
