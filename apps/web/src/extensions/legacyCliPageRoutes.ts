import { loadCliTerminal, loadToolRoute } from "../lib/routeModules";
import { lazyPageRuntime, owner, routeRuntime, standardRoute } from "./legacyRouteBindings";

export const legacyCliPageRouteOwners = [
    owner("wrapt.codex", [
      {
        page: {
          id: "wrapt.codex.page.main",
          title: "Codex",
          description: "Codex CLI im Browser",
        },
        route: standardRoute(
          "wrapt.codex.route.main",
          "wrapt.codex.page.main",
          "/codex",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "cli-terminal",
          "CodexTerminal",
          loadCliTerminal,
        ),
        routeRuntime: routeRuntime("/codex"),
      },
    ]),
    owner("wrapt.opencode", [
      {
        page: {
          id: "wrapt.opencode.page.main",
          title: "OpenCode",
          description: "OpenCode Web",
        },
        route: standardRoute(
          "wrapt.opencode.route.main",
          "wrapt.opencode.page.main",
          "/opencode",
          {
            projectContext: false,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "tool-route",
          "OpenCodeWeb",
          loadToolRoute,
        ),
        routeRuntime: routeRuntime("/opencode"),
      },
    ]),
    owner("wrapt.claude", [
      {
        page: {
          id: "wrapt.claude.page.main",
          title: "Claude Code",
          description: "Claude Code CLI im Browser",
        },
        route: standardRoute(
          "wrapt.claude.route.main",
          "wrapt.claude.page.main",
          "/claude",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "cli-terminal",
          "ClaudeCodeTerminal",
          loadCliTerminal,
        ),
        routeRuntime: routeRuntime("/claude"),
      },
    ]),
];
