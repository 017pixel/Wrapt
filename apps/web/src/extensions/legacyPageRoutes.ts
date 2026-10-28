import { legacyCliPageRouteOwners } from "./legacyCliPageRoutes";
import {
  loadFileManager,
  loadHermes,
  loadPreviewLive,
  loadProjectDetail,
  loadProjects,
  loadPlugins,
  loadSettings,
  loadSkillEditor,
  loadTerminal,
  loadToolRoute,
  loadUsage,
} from "../lib/routeModules";
import { pageRouteRegistry, type PageRouteRegistry } from "./pageRouteRegistry";
import { eagerPageRuntime, lazyPageRuntime, routeRuntime, standardRoute, standaloneRoute, owner, type LegacyPageRouteOwner, registerLegacyPageRoutes as registerPageOwners } from "./legacyRouteBindings";
export { legacyHostRoutes, type LegacyHostRouteDefinition, type LegacyPageRouteOwner, registerLegacyPageRoutes as registerPageOwners } from "./legacyRouteBindings";

export const legacyPageRouteOwners: readonly LegacyPageRouteOwner[] =
  Object.freeze([
    owner("wrapt.dashboard", [
      {
        page: {
          id: "wrapt.dashboard.page.main",
          title: "Dashboard",
          description: "Server, Dienste und Projekte",
        },
        route: standardRoute(
          "wrapt.dashboard.route.main",
          "wrapt.dashboard.page.main",
          "/",
          { prefetch: "none", mobileNavigation: true },
        ),
        pageRuntime: eagerPageRuntime("Dashboard"),
        routeRuntime: routeRuntime(),
      },
    ]),
    owner("wrapt.projects", [
      {
        page: {
          id: "wrapt.projects.page.list",
          title: "Projekte",
          description: "Konfigurierte Projektordner",
        },
        route: standardRoute(
          "wrapt.projects.route.list",
          "wrapt.projects.page.list",
          "/projects",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("projects", "Projects", loadProjects),
        routeRuntime: routeRuntime("/projects"),
      },
      {
        page: {
          id: "wrapt.projects.page.detail",
          title: "Projektdetail",
        },
        route: standardRoute(
          "wrapt.projects.route.detail",
          "wrapt.projects.page.detail",
          "/projects/:projectId",
        ),
        pageRuntime: lazyPageRuntime(
          "project-detail",
          "ProjectDetail",
          loadProjectDetail,
        ),
        routeRuntime: routeRuntime("/projects/"),
      },
    ]),
    owner("wrapt.files", [
      {
        page: {
          id: "wrapt.files.page.main",
          title: "Dateien",
          description: "Server-Dateien verwalten und durchsuchen",
        },
        route: standardRoute(
          "wrapt.files.route.main",
          "wrapt.files.page.main",
          "/files",
          {
            aliases: ["/gallery"],
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "file-manager",
          "FileManagerView",
          loadFileManager,
        ),
        routeRuntime: routeRuntime("/files", "redirect-to-canonical"),
      },
    ]),
    owner("wrapt.skills", [
      {
        page: {
          id: "wrapt.skills.page.main",
          title: "KI-Skills",
          description: "Globale Skills und Agenten-Regeln bearbeiten",
        },
        route: standardRoute(
          "wrapt.skills.route.main",
          "wrapt.skills.page.main",
          "/ki-skills",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime(
          "skill-editor",
          "SkillEditor",
          loadSkillEditor,
        ),
        routeRuntime: routeRuntime("/ki-skills"),
      },
    ]),
    owner("wrapt.settings", [
      {
        page: {
          id: "wrapt.settings.page.main",
          title: "Einstellungen",
          description: "Client-weite Einstellungen, Layout und Sicherheit",
        },
        route: standardRoute(
          "wrapt.settings.route.main",
          "wrapt.settings.page.main",
          "/settings",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("settings", "Settings", loadSettings),
        routeRuntime: routeRuntime("/settings"),
      },
    ]),
    owner("wrapt.plugins", [
      {
        page: {
          id: "wrapt.plugins.page.main",
          title: "Plugins",
          description: "Lokale Plugins erstellen und verwalten",
        },
        route: standardRoute(
          "wrapt.plugins.route.main",
          "wrapt.plugins.page.main",
          "/plugins",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("plugins", "Plugins", loadPlugins),
        routeRuntime: routeRuntime("/plugins"),
      },
      {
        page: {
          id: "wrapt.plugins.page.maker",
          title: "Plugin Maker",
          description: "Eigene Plugin-Seiten gestalten",
        },
        route: standardRoute(
          "wrapt.plugins.route.maker",
          "wrapt.plugins.page.maker",
          "/plugins/maker",
        ),
        pageRuntime: lazyPageRuntime("plugins", "PluginMaker", loadPlugins),
        routeRuntime: routeRuntime("/plugins/maker"),
      },
      {
        page: {
          id: "wrapt.plugins.page.runtime",
          title: "Plugin",
          description: "Lokale Plugin-Seite",
        },
        route: standardRoute(
          "wrapt.plugins.route.runtime",
          "wrapt.plugins.page.runtime",
          "/plugins/view/:pluginSlug",
          { aliases: ["/plugins/tool/:pluginSlug"] },
        ),
        pageRuntime: lazyPageRuntime("plugins", "PluginRuntime", loadPlugins),
        routeRuntime: routeRuntime("/plugins/view/"),
      },
    ]),
    owner("wrapt.usage", [
      {
        page: {
          id: "wrapt.usage.page.main",
          title: "Nutzung",
          description: "Codex und OpenCode Go",
        },
        route: standardRoute(
          "wrapt.usage.route.main",
          "wrapt.usage.page.main",
          "/usage",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("usage", "Usage", loadUsage),
        routeRuntime: routeRuntime("/usage"),
      },
    ]),
    owner("wrapt.t3-code", [
      {
        page: {
          id: "wrapt.t3-code.page.main",
          title: "T3 Code",
          description: "Codex-Arbeitsumgebung",
        },
        route: standardRoute(
          "wrapt.t3-code.route.main",
          "wrapt.t3-code.page.main",
          "/t3-code",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "T3Code", loadToolRoute),
        routeRuntime: routeRuntime("/t3-code"),
      },
    ]),
    owner("wrapt.hermes", [
      {
        page: {
          id: "wrapt.hermes.page.main",
          title: "Hermes Agent",
          description:
            "Offizielle Hermes-SPA für Chat, Automatisierungen und Verwaltung",
        },
        route: standardRoute(
          "wrapt.hermes.route.main",
          "wrapt.hermes.page.main",
          "/hermes-agent",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("hermes", "HermesRoute", loadHermes),
        routeRuntime: routeRuntime("/hermes-agent"),
      },
    ]),
    owner("wrapt.code-server", [
      {
        page: {
          id: "wrapt.code-server.page.main",
          title: "Code-Server",
          description: "VS Code im Browser",
        },
        route: standardRoute(
          "wrapt.code-server.route.main",
          "wrapt.code-server.page.main",
          "/code-editor",
          { projectContext: true, mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime(
          "tool-route",
          "CodeEditor",
          loadToolRoute,
        ),
        routeRuntime: routeRuntime("/code-editor"),
      },
    ]),
    owner("wrapt.previews", [
      {
        page: {
          id: "wrapt.previews.page.main",
          title: "Previews",
          description: "Lokale Apps und laufende Ports",
        },
        route: standardRoute(
          "wrapt.previews.route.main",
          "wrapt.previews.page.main",
          "/previews",
          { projectContext: true, mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "Previews", loadToolRoute),
        routeRuntime: routeRuntime("/previews"),
      },
      {
        page: {
          id: "wrapt.previews.page.live",
          title: "Live-Preview",
        },
        route: standaloneRoute(
          "wrapt.previews.route.live",
          "wrapt.previews.page.live",
          "/previews/live",
        ),
        pageRuntime: lazyPageRuntime(
          "preview-live",
          "PreviewLiveWindowRoute",
          loadPreviewLive,
        ),
        routeRuntime: routeRuntime("/previews/live"),
      },
    ]),
    owner("wrapt.terminal", [
      {
        page: {
          id: "wrapt.terminal.page.main",
          title: "Terminal",
          description: "Interaktive Server-Shell",
        },
        route: standardRoute(
          "wrapt.terminal.route.main",
          "wrapt.terminal.page.main",
          "/terminal",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "terminal",
          "TerminalView",
          loadTerminal,
        ),
        routeRuntime: routeRuntime("/terminal"),
      },
      {
        page: {
          id: "wrapt.terminal.page.window",
          title: "Terminalfenster",
        },
        route: standaloneRoute(
          "wrapt.terminal.route.window",
          "wrapt.terminal.page.window",
          "/terminal/fenster/:runtimeId",
        ),
        pageRuntime: lazyPageRuntime(
          "terminal",
          "TerminalWindowRoute",
          loadTerminal,
        ),
        routeRuntime: routeRuntime("/terminal"),
      },
    ]),
    ...legacyCliPageRouteOwners,
  ]);

/** Die bisherigen LocalStorage-IDs bleiben bis zur Preferences-Migration lesbar. */
export { pagePreferenceAliases as legacyPageAliases } from "./pagePreferenceAliases";

export function registerLegacyPageRoutes(registry: PageRouteRegistry): void {
  registerPageOwners(registry, legacyPageRouteOwners);
}

let defaultRegistryBootstrapped = false;
export function bootstrapLegacyPageRoutes(): PageRouteRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyPageRoutes(pageRouteRegistry);
    defaultRegistryBootstrapped = true;
  }
  return pageRouteRegistry;
}
