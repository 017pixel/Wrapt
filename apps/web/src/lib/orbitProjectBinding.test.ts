import { describe, expect, it } from "vitest";
import type { OrbitBoard, Project } from "@wrapt/contracts";
import { nodeFromInput } from "../stores/orbitNodeFactory";
import { resolveOrbitToolProjectBinding } from "./orbitProjectBinding";

function project(id: string, previews: Project["previews"] = []): Project {
  return {
    id,
    name: id,
    description: "",
    path: `/projects/${id}`,
    enabled: true,
    sortOrder: 0,
    availability: "available",
    activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews,
    links: { t3Code: null, codeServer: null },
  };
}

function tool(toolType: "t3-code" | "code-server" | "preview", projectId: string | null = null, previewId: string | null = null) {
  return nodeFromInput({
    type: "tool",
    title: "Werkzeug",
    toolType,
    projectId,
    previewId,
    position: { x: 0, y: 0 },
  }, 1);
}

describe("Orbit-Projektzuordnung von Werkzeugen", () => {
  it("lässt T3 ohne Projektbindung über den serverweiten Proxy laufen", () => {
    expect(resolveOrbitToolProjectBinding(tool("t3-code"), { nodes: [] }, undefined, null, [])).toBeNull();
  });

  it("repariert eine ungültige Code-Server-Zuordnung anhand von Fokus, Auswahl und Nachbarschaft", () => {
    const focused = tool("code-server", "fokus");
    const result = resolveOrbitToolProjectBinding(tool("code-server", "gelöscht"), { nodes: [] }, focused, "auswahl", [
      project("fokus"),
      project("auswahl"),
    ]);
    expect(result).toEqual({ projectId: "fokus" });

    const nearby = nodeFromInput({ type: "project", title: "Nah", projectId: "nah", position: { x: 300, y: 0 } }, 1);
    expect(resolveOrbitToolProjectBinding(tool("code-server"), { nodes: [nearby] } satisfies Pick<OrbitBoard, "nodes">, undefined, "entfernt", [project("nah")]))
      .toEqual({ projectId: "nah" });
  });

  it("zeigt bei fehlendem Code-Server-Standard eine leere, bedienbare Zuordnung und repariert Preview-IDs", () => {
    expect(resolveOrbitToolProjectBinding(tool("code-server", "gelöscht"), { nodes: [] }, undefined, null, []))
      .toEqual({ projectId: null });

    const preview = project("web", [{ id: "frontend", name: "Frontend", url: null, targetPort: 5173, path: "/", mode: "embedded", dependencies: [] }]);
    expect(resolveOrbitToolProjectBinding(tool("preview", null, "entfernt"), { nodes: [] }, undefined, "web", [preview]))
      .toEqual({ projectId: "web", previewId: "frontend" });
  });
});
