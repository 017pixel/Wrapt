import { describe, expect, it } from "vitest";
import { extensionActivationEventsV1Schema, extensionContributionsV1Schema, extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";

const backgroundService = {
    id: "workbench.agent-tasks.background-service.sync",
    title: "Agent Tasks synchronisieren",
    description: "Synchronisiert Agent Tasks im Hintergrund.",
    provider: "workbench.agent-tasks.background-service-provider.sync",
    enabledByDefault: true,
    restart: {
      mode: "on-failure",
      maxAttempts: 3,
      windowMilliseconds: 300_000,
      backoffMilliseconds: 1_000,
    },
    health: {
      intervalMilliseconds: 30_000,
      timeoutMilliseconds: 5_000,
      failureThreshold: 3,
    },
    shutdownTimeoutMilliseconds: 10_000,
  } as const;
const scheduledJob = {
    id: "workbench.agent-tasks.scheduled-job.sync",
    title: "Agent Tasks synchronisieren",
    description: "Synchronisiert Agent Tasks regelmäßig.",
    provider: "workbench.agent-tasks.scheduled-job-provider.sync",
    enabledByDefault: true,
    schedule: {
      type: "interval",
      everyMilliseconds: 300_000,
      initialDelayMilliseconds: 1_000,
    },
    timeoutMilliseconds: 30_000,
    concurrency: { mode: "skip" },
    missedRuns: { mode: "run-once" },
    retries: {
      maxAttempts: 3,
      initialBackoffMilliseconds: 1_000,
      maximumBackoffMilliseconds: 30_000,
      multiplier: 2,
    },
    idempotency: "host-key",
    cancellationTimeoutMilliseconds: 5_000,
    historyLimit: 100,
  } as const;
const httpEndpoint = {
    id: "workbench.agent-tasks.http.task",
    description: "Liest einen Agent Task.",
    provider: "workbench.agent-tasks.http-provider.task",
    requestSchema: "./schemas/task-request.json",
    responseSchema: "./schemas/task-response.json",
    maxRequestBytes: 64_000,
    maxResponseBytes: 256_000,
    timeoutMilliseconds: 10_000,
    rateLimit: { maxRequests: 60, windowMilliseconds: 60_000 },
    method: "GET",
    path: "/tasks/:taskId",
  } as const;
const rpcProcedure = {
    id: "workbench.agent-tasks.rpc.create",
    description: "Erstellt einen Agent Task.",
    provider: "workbench.agent-tasks.rpc-provider.create",
    requestSchema: "./schemas/create-task-request.json",
    responseSchema: "./schemas/create-task-response.json",
    maxRequestBytes: 64_000,
    maxResponseBytes: 256_000,
    timeoutMilliseconds: 10_000,
    rateLimit: { maxRequests: 30, windowMilliseconds: 60_000 },
    kind: "mutation",
  } as const;
const realtimeChannel = {
    id: "workbench.agent-tasks.realtime.tasks",
    description: "Synchronisiert Agent Tasks in Echtzeit.",
    provider: "workbench.agent-tasks.realtime-provider.tasks",
    scope: "project",
    maxMessageBytes: 64_000,
    maxConnectionsPerUser: 4,
    queue: {
      delivery: "reliable",
      highWaterMarkBytes: 128_000,
      maxQueueBytes: 1_000_000,
    },
    rateLimit: { maxMessages: 120, windowMilliseconds: 60_000 },
    heartbeat: {
      intervalMilliseconds: 30_000,
      timeoutMilliseconds: 10_000,
    },
    closeTimeoutMilliseconds: 2_000,
    direction: "bidirectional",
    clientMessageSchema: "./schemas/task-client-message.json",
    serverMessageSchema: "./schemas/task-server-message.json",
  } as const;
const notificationSource = {
    id: "workbench.agent-tasks.notification.source",
    title: "Agent Tasks",
    description: "Benachrichtigungen zu Agent-Aufgaben.",
    icon: "extension",
    categories: [
      {
        id: "workbench.agent-tasks.notification-category.tasks",
        title: "Agent-Aufgaben",
      },
    ],
    actions: [
      {
        id: "workbench.agent-tasks.notification-action.open",
        title: "Aufgabe öffnen",
        commandId: "workbench.agent-tasks.command.create",
      },
    ],
    retention: "until-resolved",
    deduplication: {
      mode: "keyed",
      keyMaxLength: 128,
      behavior: "replace-active",
    },
  } as const;
const darkThemePalette = {
    surfaceBase: "#0a0a0a",
    surfaceRaised: "#111111",
    surfaceOverlay: "#191919",
    surfaceSunken: "#060606",
    text: "#f5f5f5",
    textMuted: "#a0a0a0",
    textFaint: "#737373",
    accent: "#3666c2",
    accentContrast: "#ffffff",
    success: "#4bb38b",
    warning: "#d4a940",
    danger: "#cf7478",
    info: "#79a5df",
  } as const;
const themeContribution = {
    id: "workbench.agent-tasks.theme.nightly",
    title: "Agent Tasks Nightly",
    description: "Dunkles Theme für die Workbench.",
    variants: { dark: darkThemePalette },
  } as const;

describe("Extension Manifest: themes", () => {
  it("akzeptiert statische Theme Contributions ohne Entrypoint oder Permission", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          permissions: [],
          contributes: { themes: [themeContribution] },
        }).success,
      ).toBe(true);
    });

  it("verlangt für Themes eigene und manifestweit eindeutige IDs", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            themes: [
              {
                ...themeContribution,
                id: "workbench.other.theme.nightly",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            themes: [
              {
                ...themeContribution,
                id: validManifest.contributes.commands[0]!.id,
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("hält unbekannte Contributions geschlossen und verlangt nichtleere Listen", () => {
      expect(extensionActivationEventsV1Schema.safeParse([]).success).toBe(true);
      expect(extensionContributionsV1Schema.safeParse({}).success).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          commands: validManifest.contributes.commands,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ commands: [] }).success,
      ).toBe(false);
      expect(
        extensionActivationEventsV1Schema.safeParse(["onStartup"]).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          pages: validManifest.contributes.pages,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          routes: validManifest.contributes.routes,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          navigation: validManifest.contributes.navigation,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          dashboard: validManifest.contributes.dashboard,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          settings: validManifest.contributes.settings,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          keyboardShortcuts: validManifest.contributes.keyboardShortcuts,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          contextMenus: validManifest.contributes.contextMenus,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          statusBar: validManifest.contributes.statusBar,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          topbar: validManifest.contributes.topbar,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({
          files: validManifest.contributes.files,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ pages: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ navigation: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ mobileNavigation: [] })
          .success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ settings: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ keyboardShortcuts: [] })
          .success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ contextMenus: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ statusBar: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ topbar: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ files: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          terminal: validManifest.contributes.terminal,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ terminal: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          previews: validManifest.contributes.previews,
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ previews: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          agentTools: [
            {
              id: "workbench.agent-tasks.agent-tool.create",
              kind: "command",
              title: "Aufgabe erstellen",
              description: "Erstellt eine Aufgabe im aktuellen Projekt.",
              inputSchema: "./schemas/create-task-input.json",
              projectContext: true,
              approval: "host-policy",
              commandId: "workbench.agent-tasks.command.create",
            },
          ],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ agentTools: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          agentSkills: [
            {
              id: "workbench.agent-tasks.agent-skill.task-management",
              name: "workbench-agent-tasks-task-management",
              description: "Verwaltet Agent Tasks in Wrapt.",
              path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
              targets: ["codex"],
              enabledByDefault: false,
            },
          ],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ agentSkills: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          backgroundServices: [backgroundService],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ backgroundServices: [] })
          .success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          scheduledJobs: [scheduledJob],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ scheduledJobs: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ http: [httpEndpoint] })
          .success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ rpc: [rpcProcedure] }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ http: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ rpc: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          realtime: [realtimeChannel],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ realtime: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          notifications: [notificationSource],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ notifications: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({
          themes: [themeContribution],
        }).success,
      ).toBe(true);
      expect(
        extensionContributionsV1Schema.safeParse({ themes: [] }).success,
      ).toBe(false);
      expect(
        extensionContributionsV1Schema.safeParse({ unknown: [] }).success,
      ).toBe(false);
    });
});
