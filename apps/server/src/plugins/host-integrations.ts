import { execa } from "execa";
import { z } from "zod";
import {
  notificationListResponseSchema, notificationSchema, pluginNotificationCreateSchema,
  pluginGitRequestSchema, pluginGitResponseSchema, pluginTerminalCreateSchema,
  previewSessionRequestSchema, previewSessionResponseSchema, previewSlotsResponseSchema,
} from "@wrapt/contracts";
import type { NotificationDatabase } from "../notifications/database.js";
import type { PreviewSlotService } from "../previews/slots.js";
import type { TerminalManager } from "../terminal/Manager.js";
import type { createProjectService } from "../services/projectService.js";
import { AppError } from "../utils/errors.js";
import type { PluginHostApi } from "./code-host-api.js";

interface Integrations {
  notifications: Pick<NotificationDatabase, "create" | "list">;
  terminals: Pick<TerminalManager, "listSessions" | "createSession" | "writeToSession" | "closeSession">;
  previews: Pick<PreviewSlotService, "list" | "openSession" | "closeSessionById">;
  projects: Pick<ReturnType<typeof createProjectService>, "get">;
}

/** Fachservices behalten ihre Pfadgrenzen und ihre besitzergebundenen Sitzungen. */
export function registerIntegrationPluginApi(api: PluginHostApi, services: Integrations): void {
  const sessionId = z.object({ sessionId: z.uuid() });
  api.register("notifications.create", {
    description: "Workbench-Benachrichtigung erstellen", mutates: true, hookable: true,
    input: pluginNotificationCreateSchema, output: notificationSchema,
    handler: (input) => services.notifications.create({ ...input, source: "wrapt", sourceIcon: "wrapt", category: "terminal", kind: "plugin.notification" }),
  });
  api.register("notifications.list", {
    description: "Benachrichtigungen lesen", mutates: false, hookable: true,
    input: z.object({ limit: z.number().int().min(1).max(100).default(50), unreadOnly: z.boolean().default(false) }).default({ limit: 50, unreadOnly: false }),
    output: notificationListResponseSchema, handler: (input) => services.notifications.list(input),
  });
  for (const action of ["status", "diff"] as const) api.register(`git.${action}`, {
    description: action === "status" ? "Git-Status eines registrierten Projekts lesen" : "Git-Diff eines registrierten Projekts lesen",
    mutates: false, hookable: true, input: pluginGitRequestSchema, output: pluginGitResponseSchema,
    handler: async ({ projectId, staged }, request) => {
      const { project } = await services.projects.get(projectId);
      if (project.availability !== "available") throw new AppError(409, "PROJECT_UNAVAILABLE", "Das Projekt ist nicht verfügbar.");
      const args = action === "status" ? ["status", "--porcelain=v1", "--branch"] : ["diff", "--no-ext-diff", "--no-textconv", ...(staged ? ["--cached"] : [])];
      const result = await execa("git", ["-C", project.path, ...args], { timeout: 5_000, maxBuffer: 2 * 1024 * 1024, cancelSignal: request.signal, env: { GIT_OPTIONAL_LOCKS: "0" } });
      return { projectId, output: result.stdout };
    },
  });
  api.register("terminal.list", {
    description: "Eigene Terminal-Sitzungen lesen", mutates: false, hookable: true,
    handler: async (_input, request) => {
      const sessions = await services.terminals.listSessions(request.userId);
      return sessions.map(({ id, runtimeId, kind, projectId, cwd, status }) => ({ id, runtimeId, kind, projectId, cwd, status }));
    },
  });
  api.register("terminal.create", {
    description: "Shell im erlaubten Arbeitsverzeichnis öffnen", mutates: true, hookable: true,
    input: pluginTerminalCreateSchema,
    handler: async (input, request) => {
      const cwd = input.cwd ?? (input.projectId ? (await services.projects.get(input.projectId)).project.path : undefined);
      const session = await services.terminals.createSession(request.userId, { kind: "shell", mode: "agent", projectId: input.projectId, cols: input.cols, rows: input.rows, ...(cwd ? { cwd } : {}) });
      return { id: session.id, runtimeId: session.runtimeId };
    },
  });
  api.register("terminal.write", {
    description: "Eingabe an eigene Terminal-Sitzung senden", mutates: true, hookable: true,
    input: sessionId.extend({ data: z.string().max(65_536) }), output: z.null(),
    handler: ({ sessionId, data }, request) => { services.terminals.writeToSession(request.userId, sessionId, data); return null; },
  });
  api.register("terminal.close", {
    description: "Eigene Terminal-Sitzung schließen", mutates: true, hookable: true,
    input: sessionId, output: z.null(),
    handler: async ({ sessionId }, request) => { await services.terminals.closeSession(request.userId, sessionId); return null; },
  });
  api.register("previews.list", {
    description: "Preview-Slots mit eigener Zuordnung lesen", mutates: false, hookable: true,
    output: previewSlotsResponseSchema, handler: (_input, request) => services.previews.list(null, request.userId),
  });
  api.register("previews.open", {
    description: "Eigene Preview-Sitzung öffnen", mutates: true, hookable: true,
    input: previewSessionRequestSchema, output: previewSessionResponseSchema,
    handler: (input, request) => services.previews.openSession(request.userId, input),
  });
  api.register("previews.close", {
    description: "Eigene Preview-Sitzung schließen", mutates: true, hookable: true,
    input: sessionId, output: z.null(),
    handler: ({ sessionId }, request) => { services.previews.closeSessionById(request.userId, sessionId); return null; },
  });
}
