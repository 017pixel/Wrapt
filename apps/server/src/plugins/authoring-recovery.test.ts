import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDraftContentSchema } from "@wrapt/contracts";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginAuthoringService, type PluginRegistryBridge } from "./authoring.js";

const roots: string[] = [];
const content = (slug: string) => pluginDraftContentSchema.parse({
  slug, name: "Recovery", description: "Test", publisher: "local", category: "productivity", version: "0.1.0",
  routePath: `/plugins/view/${slug}`, pageMode: "blocks", iframeUrl: null, html: "", blocks: [], functions: [],
  orbit: { enabled: false, title: "Recovery", description: "", placement: "orbit", nodeType: "note", accent: "accent" },
  wizard: { goal: "", audience: "", design: "klar", layout: "einspaltig", tone: "direkt", includeHtml: false, includeIframe: false, includeOrbit: false, additionalDescription: "", wishes: "", agent: "codex", permissions: [] },
  sourceExampleId: null, status: "draft",
});

async function service(root: string, registry: PluginRegistryBridge) {
  return new PluginAuthoringService(join(root, "drafts"), join(root, "examples"), join(root, "published"), { refresh: vi.fn() } as unknown as LocalExtensionCatalog, registry);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Plugin-Authoring-Kompensation", () => {
  it("stellt aktiven Draft und Paket bei fehlgeschlagener Deaktivierung wieder her", async () => {
    const root = await mkdtemp(join(tmpdir(), "plugin-recovery-")); roots.push(root);
    const registry: PluginRegistryBridge = {
      syncLocalPlugin: vi.fn(async () => undefined),
      disableLocalPlugin: vi.fn(async () => { throw new Error("Registry nicht erreichbar"); }),
      uninstallLocalPlugin: vi.fn(async () => undefined),
    };
    const drafts = await service(root, registry);
    const draft = await drafts.createDraft(content("deactivate-recovery"));
    await drafts.activateDraft(draft.id);

    await expect(drafts.deactivateDraft(draft.id)).rejects.toThrow("Registry nicht erreichbar");
    await expect(drafts.getDraft(draft.id)).resolves.toMatchObject({ activationStatus: "active" });
    await expect(readFile(join(root, "published", draft.slug, "extension.json"))).resolves.toBeTruthy();
  });

  it("stellt Dateien bei fehlgeschlagenem Registry-Löschen wieder her", async () => {
    const root = await mkdtemp(join(tmpdir(), "plugin-delete-recovery-")); roots.push(root);
    const registry: PluginRegistryBridge = {
      syncLocalPlugin: vi.fn(async () => undefined),
      disableLocalPlugin: vi.fn(async () => undefined),
      uninstallLocalPlugin: vi.fn(async () => { throw new Error("Registry nicht erreichbar"); }),
    };
    const drafts = await service(root, registry);
    const draft = await drafts.createDraft(content("delete-recovery"));
    await drafts.activateDraft(draft.id);

    await expect(drafts.deleteDraft(draft.id)).rejects.toThrow("Registry nicht erreichbar");
    await expect(drafts.getDraft(draft.id)).resolves.toMatchObject({ id: draft.id, activationStatus: "active" });
    await expect(readFile(join(root, "published", draft.slug, "plugin.json"))).resolves.toBeTruthy();
  });
});
