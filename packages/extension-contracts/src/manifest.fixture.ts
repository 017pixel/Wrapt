export const validManifest = {
  $schema:
    "./node_modules/@wrapt/extension-contracts/schema/extension-manifest-v1.schema.json",
  manifestVersion: 1,
  id: "workbench.agent-tasks",
  name: "Agent Tasks",
  version: "1.0.0",
  publisher: "wrapt",
  description: "Aufgaben und Agent Runs verwalten",
  license: "MIT",
  category: "productivity",
  keywords: ["agents", "tasks"],
  icon: "./assets/icon.webp",
  readme: "./README.md",
  changelog: "./CHANGELOG.md",
  dataSchemaVersion: 1,
  engines: {
    wrapt: ">=0.95.0",
    extensionApi: "^1",
  },
  trust: "catalog-first-party",
  entrypoints: {
    ui: "./dist/ui.js",
    server: "./dist/server.mjs",
  },
  permissions: [],
  activationEvents: [],
  extensionDependencies: {
    "workbench.projects": "^1.0.0",
  },
  optionalExtensionDependencies: {
    "workbench.notifications": ">=1.0.0 <2.0.0",
  },
  extensionConflicts: [
    { id: "workbench.legacy-agent-tasks", range: "<2.0.0" },
    { id: "workbench.agent-board" },
  ],
  contributes: {
    commands: [
      {
        id: "workbench.agent-tasks.command.create",
        title: "Agent Tasks: Aufgabe erstellen",
        description: "Erstellt eine neue Aufgabe im aktuellen Projekt.",
        category: "Agent Tasks",
      },
    ],
    pages: [
      {
        id: "workbench.agent-tasks.page.main",
        title: "Agent Tasks",
      },
    ],
    routes: [
      {
        id: "workbench.agent-tasks.route.main",
        pageId: "workbench.agent-tasks.page.main",
        path: "/agent-tasks",
        shell: "standard",
        persistent: true,
        prefetch: "idle",
        projectContext: true,
        topbar: true,
        breadcrumbs: true,
        standaloneActions: false,
        mobileNavigation: true,
      },
    ],
    navigation: [
      {
        id: "workbench.agent-tasks.navigation.main",
        routeId: "workbench.agent-tasks.route.main",
        label: "Agent Tasks",
        description: "Aufgaben und Agent Runs verwalten.",
        icon: "workbench.agent-tasks.icon.main",
        group: "tools",
        order: 120,
        badgeProvider: "workbench.agent-tasks.badge.open-tasks",
        visibleByDefault: true,
      },
    ],
    dashboard: [
      {
        id: "workbench.agent-tasks.dashboard.open-count",
        kind: "metric",
        title: "Offene Aufgaben",
        icon: "workbench.agent-tasks.icon.tasks",
        defaultSize: "small",
        order: 100,
        projectContext: true,
        visibleByDefault: true,
        provider: "workbench.agent-tasks.dashboard-provider.open-count",
        refresh: { mode: "interval", intervalMilliseconds: 5_000 },
        format: "number",
      },
      {
        id: "workbench.agent-tasks.dashboard.create",
        kind: "quick-action",
        title: "Aufgabe erstellen",
        defaultSize: "small",
        order: 110,
        projectContext: true,
        visibleByDefault: true,
        commandId: "workbench.agent-tasks.command.create",
      },
    ],
    settings: [
      {
        id: "workbench.agent-tasks.settings.general",
        kind: "schema",
        title: "Agent Tasks",
        icon: "workbench.agent-tasks.icon.settings",
        order: 100,
        scope: "user",
        fields: [
          {
            id: "workbench.agent-tasks.setting.notifications",
            type: "boolean",
            label: "Benachrichtigungen",
            required: false,
            default: true,
          },
          {
            id: "workbench.agent-tasks.setting.api-token",
            type: "secret",
            label: "API Token",
            required: true,
          },
        ],
      },
    ],
    keyboardShortcuts: [
      {
        id: "workbench.agent-tasks.shortcut.create",
        commandId: "workbench.agent-tasks.command.create",
        keybinding: [{ key: "KeyK", modifiers: ["primary", "shift"] }],
        when: {
          all: [
            {
              key: "host.input.focused",
              operator: "equals",
              value: false,
            },
          ],
        },
        allowInEditable: false,
        allowRepeat: false,
      },
    ],
    contextMenus: [
      {
        id: "workbench.agent-tasks.context-menu.create",
        surface: "host.context-menu.project",
        commandId: "workbench.agent-tasks.command.create",
        group: "create",
        order: 100,
        icon: "workbench.agent-tasks.icon.tasks",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    statusBar: [
      {
        id: "workbench.agent-tasks.status-bar.open-count",
        kind: "counter",
        title: "Offene Aufgaben",
        icon: "workbench.agent-tasks.icon.tasks",
        alignment: "right",
        order: 100,
        priority: 60,
        compact: "value",
        provider: "workbench.agent-tasks.status-provider.open-count",
        commandId: "workbench.agent-tasks.command.create",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    topbar: [
      {
        id: "workbench.agent-tasks.topbar.create",
        kind: "action",
        routeId: "workbench.agent-tasks.route.main",
        commandId: "workbench.agent-tasks.command.create",
        icon: "workbench.agent-tasks.icon.tasks",
        placement: "primary",
        order: 100,
        priority: 80,
        presentation: "icon-label",
        compact: "icon",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    files: [
      {
        id: "workbench.agent-tasks.file.open",
        kind: "opener",
        title: "In Agent Tasks öffnen",
        icon: "workbench.agent-tasks.icon.tasks",
        matcher: {
          extensions: ["task.json"],
          mimeTypes: ["application/json"],
          caseSensitiveFileNames: false,
        },
        priority: 60,
        commandId: "workbench.agent-tasks.command.create",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    terminal: [
      {
        id: "workbench.agent-tasks.terminal.action.create",
        kind: "action",
        title: "Aufgabe im Terminal erstellen",
        icon: "workbench.agent-tasks.icon.tasks",
        order: 100,
        commandId: "workbench.agent-tasks.command.create",
        group: "create",
        surfaces: ["toolbar", "mobile-actions"],
        requiresSession: true,
      },
    ],
    previews: [
      {
        id: "workbench.agent-tasks.preview.action.reload",
        kind: "action",
        title: "Task Preview neu laden",
        icon: "workbench.agent-tasks.icon.tasks",
        order: 100,
        commandId: "workbench.agent-tasks.command.create",
        group: "view",
        surfaces: ["hub-toolbar", "mobile-actions"],
        requiresSession: true,
      },
    ],
  },
};
