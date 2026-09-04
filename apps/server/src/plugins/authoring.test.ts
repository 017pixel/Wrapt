import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pluginDraftContentSchema, pluginDraftSchema, type PluginDraftContent } from "@wrapt/contracts";
import { extensionManifestV1Schema } from "@wrapt/extension-contracts";
import type { LocalExtensionCatalog } from "../extensions/catalog.js";
import { PluginAuthoringService } from "./authoring.js";
import { contentOf } from "./draft-content.js";

function draftContent(slug: string): PluginDraftContent {
  return pluginDraftContentSchema.parse({
    slug,
    name: "Lokales Plugin",
    description: "Ein lokaler Test-Draft.",
    publisher: "local",
    category: "productivity",
    version: "0.1.0",
    routePath: `/plugins/view/${slug}`,
    pageMode: "blocks",
    iframeUrl: null,
    html: "",
    blocks: [{ id: "intro", type: "heading", title: "Intro", content: "Text", actionId: null }],
    functions: [],
    orbit: { enabled: false, title: "Plugin", description: "", placement: "orbit", nodeType: "note", accent: "accent" },
    wizard: {
      goal: "",
      audience: "",
      design: "klar",
      layout: "einspaltig",
      tone: "direkt",
      includeHtml: false,
      includeIframe: false,
      includeOrbit: false,
      additionalDescription: "",
      wishes: "",
      agent: "codex",
      permissions: [],
    },
    sourceExampleId: null,
    status: "draft",
  });
}

describe("Plugin-Authoring lokal", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("liefert für jedes lokale Beispiel ein sichtbares Icon und mindestens eine echte Aktion", async () => {
    const examplesDirectory = resolve(import.meta.dirname, "../../../../extensions/plugins");
    const entries = await readdir(examplesDirectory, { withFileTypes: true });
    const examples = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) =>
      pluginDraftContentSchema.parse(JSON.parse(await readFile(join(examplesDirectory, entry.name, "plugin.json"), "utf8")) as unknown),
    ));

    expect(examples).toHaveLength(11);
    for (const example of examples) {
      expect(example.icon).not.toBe("extensions");
      expect(example.functions.length).toBeGreaterThan(0);
      if (example.surfaces.includes("page")) {
        expect(example.pageMode === "blocks" ? example.blocks.length : example.pageMode === "html" ? example.html.length : example.iframeUrl).toBeTruthy();
      } else {
        expect(example.surfaces).toContain("topbar");
      }
    }
  });

  it("blendet nicht markierte persönliche Inhalte aus dem Store aus", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-store-"));
    directories.push(root);
    const examplesDirectory = join(root, "examples");
    await mkdir(join(examplesDirectory, "persoenlich"), { recursive: true });
    await writeFile(join(examplesDirectory, "persoenlich", "plugin.json"), `${JSON.stringify(draftContent("persoenlich"))}\n`, "utf8");
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      examplesDirectory,
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );

    await expect(service.listExamples()).resolves.toEqual([]);
  });

  it("validiert einen Draft vor der Aktivierung und erzeugt kein Placeholder-Entrypoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const catalog = { refresh: vi.fn() } as unknown as LocalExtensionCatalog;
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      catalog,
    );
    const draft = await service.createDraft(draftContent("lokal-test"));

    const validation = await service.validateDraft(draft.id);
    expect(validation.valid).toBe(true);
    expect(validation.draft.activationStatus).toBe("ready");

    const activation = await service.activateDraft(draft.id);
    const entrypoint = await readFile(join(root, "published", "lokal-test", "index.js"), "utf8");
    expect(activation.draft.activationStatus).toBe("active");
    expect(entrypoint).not.toBe("export default {};\n");
    expect(catalog.refresh).toHaveBeenCalled();
  });

  it("hält ein erneut validiertes aktives Plugin aktiv und entfernt alte Paketdateien", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft({
      ...draftContent("active-revalidate"),
      packageFiles: [{ path: "obsolete.txt", content: "alt" }],
    });
    await service.activateDraft(draft.id);
    const active = await service.getDraft(draft.id);
    await service.updateDraft(draft.id, {
      ...contentOf(active),
      description: "Aktualisierte Beschreibung.",
      packageFiles: [{ path: "README.md", content: "# Aktuell\n" }],
    });

    const validation = await service.validateDraft(draft.id);

    expect(validation.valid).toBe(true);
    expect(validation.draft.activationStatus).toBe("active");
    await expect(readFile(join(root, "published", "active-revalidate", "obsolete.txt"))).rejects.toThrow();
    await expect(readFile(join(root, "published", "active-revalidate", "README.md"), "utf8"))
      .resolves.toBe("# Aktuell\n");
  });

  it("vergibt bei neuen Drafts eindeutige Slugs und blockiert spätere Kollisionen", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );

    const first = await service.createDraft(draftContent("gleich"));
    const second = await service.createDraft(draftContent("gleich"));

    expect(first.slug).toBe("gleich");
    expect(second.slug).toBe("gleich-2");
    expect(second.routePath).toBe("/plugins/view/gleich-2");
    await expect(service.updateDraft(first.id, { ...draftContent("gleich-2"), name: "Kollision" }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("lässt Lifecycle und Veröffentlichungsstatus nicht über ein normales Update fälschen", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft(draftContent("lifecycle-test"));

    const updated = await service.updateDraft(draft.id, {
      ...draftContent("lifecycle-test"),
      activationStatus: "active",
      status: "published",
    });

    expect(updated.activationStatus).toBe("draft");
    expect(updated.status).toBe("draft");
    await expect(readFile(join(root, "published", "lifecycle-test", "extension.json"))).rejects.toThrow();
  });

  it("weist einen stale Draft-Write mit 409 zurück", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft(draftContent("revision-test"));
    const first = await service.updateDraft(draft.id, { ...contentOf(draft), description: "Erste Fassung." });

    await expect(service.updateDraft(draft.id, { ...contentOf(draft), description: "Stale Fassung." }))
      .rejects.toMatchObject({ statusCode: 409, code: "PLUGIN_REVISION_CONFLICT" });
    await expect(service.getDraft(draft.id)).resolves.toMatchObject({ revision: first.revision, description: "Erste Fassung." });
  });

  it("behält bei alten doppelten Slugs das Paket des tatsächlichen Besitzers", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const draftsDirectory = join(root, "drafts");
    const service = new PluginAuthoringService(
      draftsDirectory,
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const owner = await service.createDraft(draftContent("legacy-gleich"));
    await service.activateDraft(owner.id);
    const legacy = pluginDraftSchema.parse({
      ...draftContent("legacy-gleich"),
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
    });
    await writeFile(join(draftsDirectory, `${legacy.id}.json`), `${JSON.stringify(legacy)}\n`, "utf8");

    await service.deleteDraft(legacy.id);

    const storedOwner = JSON.parse(
      await readFile(join(root, "published", "legacy-gleich", "plugin.json"), "utf8"),
    ) as { id: string };
    expect(storedOwner.id).toBe(owner.id);
  });

  it("materialisiert gewählte Host-Flächen als validierbare Contributions", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const content = pluginDraftContentSchema.parse({
      ...draftContent("surface-test"),
      surfaces: ["page", "sidebar", "topbar", "bottom-bar", "dashboard", "orbit", "context-menu"],
      surfaceContributions: [
        {
          id: "release-status",
          surface: "topbar",
          title: "Release-Status",
          description: "Zeigt den aktuellen Release-Status.",
          mobileBehavior: "bottom-sheet",
          token: "accent",
        },
      ],
      wizard: {
        ...draftContent("surface-test").wizard,
        permissions: ["preview.read", "notifications.create"],
      },
    });
    const draft = await service.createDraft(content);

    await service.activateDraft(draft.id);

    const manifest = JSON.parse(await readFile(join(root, "published", "surface-test", "extension.json"), "utf8")) as unknown;
    const parsed = extensionManifestV1Schema.parse(manifest);
    expect(parsed.permissions).toEqual([
      { permission: "preview.read" },
      { permission: "notifications.create" },
    ]);
    expect(parsed.contributes.navigation).toHaveLength(1);
    expect(parsed.contributes.navigation?.[0]?.group).toBe("tools");
    expect(parsed.contributes.topbar).toHaveLength(1);
    expect(parsed.contributes.statusBar).toHaveLength(1);
    expect(parsed.contributes.dashboard).toHaveLength(1);
    expect(parsed.contributes.orbit).toHaveLength(1);
    expect(parsed.contributes.contextMenus).toHaveLength(1);
  });

  it("schreibt eine vollständige Werkzeugseite mit mobiler Sidebar-Navigation", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft(pluginDraftContentSchema.parse({
      ...draftContent("tool-page"),
      icon: "clock",
      pageMode: "iframe",
      iframeUrl: "https://example.com/tool",
      functions: [{ id: "open", label: "Öffnen", action: "open-route", value: "/projects" }],
      surfaces: ["page", "sidebar"],
      wizard: { ...draftContent("tool-page").wizard, includeIframe: true, surfaces: ["page", "sidebar"] },
    }));

    await service.activateDraft(draft.id);

    const manifest = JSON.parse(await readFile(join(root, "published", "tool-page", "extension.json"), "utf8")) as {
      contributes: { navigation: Array<{ group: string; routeId: string }>; routes: Array<{ path: string; mobileNavigation: boolean }> };
    };
    const plugin = JSON.parse(await readFile(join(root, "published", "tool-page", "plugin.json"), "utf8")) as { icon: string };
    expect(manifest.contributes.navigation[0]?.group).toBe("tools");
    expect(manifest.contributes.routes[0]?.mobileNavigation).toBe(true);
    expect(manifest.contributes.routes[0]?.path).toBe("/plugins/tool/tool-page");
    expect(plugin.icon).toBe("clock");
  });

  it("blockiert unbekannte Permissions bereits bei der Validierung", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft({
      ...draftContent("permission-test"),
      wizard: { ...draftContent("permission-test").wizard, permissions: ["host.dom.write"] },
    });

    const validation = await service.validateDraft(draft.id);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.message.includes("Permission"))).toBe(true);
    await expect(service.activateDraft(draft.id)).rejects.toThrow("Validierungsfehler");
  });

  it("meldet einen nicht unterstützten Host-Slot als Validierungsfehler", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft(draftContent("fehler-test"));
    const invalid = { ...draft, surfaces: ["body"] };
    await expect(service.updateDraft(draft.id, invalid)).rejects.toThrow();
  });

  it("entfernt beim Deaktivieren das generierte lokale Paket, behält aber den Draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft(draftContent("deactivate-test"));
    await service.activateDraft(draft.id);

    const deactivated = await service.deactivateDraft(draft.id);

    expect(deactivated.activationStatus).toBe("disabled");
    await expect(readFile(join(root, "published", "deactivate-test", "extension.json"))).rejects.toThrow();
    await expect(service.getDraft(draft.id)).resolves.toMatchObject({ activationStatus: "disabled" });
  });

  it("entfernt beim Löschen Draft und generiertes lokales Paket", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapt-plugin-authoring-"));
    directories.push(root);
    const service = new PluginAuthoringService(
      join(root, "drafts"),
      join(root, "examples"),
      join(root, "published"),
      { refresh: vi.fn() } as unknown as LocalExtensionCatalog,
    );
    const draft = await service.createDraft(draftContent("delete-test"));
    await service.activateDraft(draft.id);

    await service.deleteDraft(draft.id);

    await expect(service.getDraft(draft.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(readFile(join(root, "published", "delete-test", "extension.json"))).rejects.toThrow();
  });
});
