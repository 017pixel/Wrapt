import { describe, expect, it } from "vitest";
import type { Project } from "@wrapt/contracts";
import { projectToolOptions, projectToolPath } from "./projectTools";

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "demo",
  name: "Demo",
  description: "",
  path: "/tmp/demo",
  enabled: true,
  sortOrder: 1,
  availability: "available",
  activity: {
    lastWorkbenchUseAt: null,
    lastFilesystemChangeAt: null,
    lastGitCommitAt: null,
    effectiveAt: null,
  },
  previews: [],
  links: { t3Code: null, codeServer: null },
  ...overrides,
});

describe("projectToolOptions", () => {
  it("zeigt alle projektgebundenen Workbench-Werkzeuge und konfigurierte Previews", () => {
    const options = projectToolOptions(project({
      links: { t3Code: "https://t3.example.test", codeServer: "https://editor.example.test" },
      previews: [{
        id: "frontend",
        name: "Frontend",
        url: null,
        targetPort: 5173,
        path: "/",
        mode: "hybrid",
        dependencies: [],
      }],
    }), true);

    expect(options.map((option) => option.type)).toEqual([
      "t3-code",
      "code-server",
      "preview",
      "terminal",
      "opencode",
      "codex",
      "claude",
      "files",
      "preview",
    ]);
    expect(options.at(-1)).toMatchObject({ id: "preview:frontend", label: "Frontend", previewId: "frontend" });
    expect(options[2]).toMatchObject({ id: "preview-runtime", label: "Projektlaufzeit" });
    expect(options[2]).not.toHaveProperty("previewId");
  });

  it("blendet nicht verfügbare Server-Werkzeuge aus, behält aber lokale Werkzeuge", () => {
    expect(projectToolOptions(project(), false).map((option) => option.type)).toEqual([
      "preview",
      "terminal",
      "opencode",
      "codex",
      "claude",
      "files",
    ]);
  });

  it("bietet den konfigurierten Editor nur bei aktivem Dienst an", () => {
    const configured = project({ links: { t3Code: null, codeServer: "https://editor.example.test" } });
    expect(projectToolOptions(configured, false).some((option) => option.type === "code-server")).toBe(false);
    expect(projectToolOptions(configured, true).some((option) => option.type === "code-server")).toBe(true);
  });

  it("liefert reine Zielpfade für Hover Prefetch ohne Store Nebeneffekt", () => {
    expect(projectToolPath({ id: "terminal", label: "Terminal", type: "terminal", icon: () => null })).toBe("/terminal");
    expect(projectToolPath({ id: "t3-code", label: "T3", type: "t3-code", icon: () => null })).toBe("/t3-code");
    expect(projectToolPath({ id: "codex", label: "Codex", type: "codex", icon: () => null })).toBe("/codex");
    expect(projectToolPath({ id: "claude", label: "Claude", type: "claude", icon: () => null })).toBe("/claude");
    expect(projectToolPath({ id: "opencode", label: "OpenCode", type: "opencode", icon: () => null })).toBe("/opencode");
    expect(projectToolPath({ id: "code-server", label: "Editor", type: "code-server", icon: () => null })).toBe("/code-editor");
    expect(projectToolPath({ id: "files", label: "Dateien", type: "files", icon: () => null })).toBe("/files");
    expect(projectToolPath({ id: "preview-runtime", label: "Laufzeit", type: "preview", icon: () => null })).toBe("/previews");
    expect(projectToolPath({ id: "preview:x", label: "X", type: "preview", icon: () => null, previewId: "x" })).toBe("/previews?preview=x");
  });
});
