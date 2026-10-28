import { createProjectFileRequestSchema, projectActivityTouchResponseSchema, projectFileResponseSchema, projectResponseSchema, projectsResponseSchema, registerProjectRequestSchema, registerProjectResponseSchema, fileManagerDeleteRequestSchema, fileManagerMkdirRequestSchema, fileManagerMoveRequestSchema, fileManagerRenameRequestSchema, fileManagerTextPreviewResponseSchema, fileManagerSearchResponseSchema, filesystemTreeResponseSchema, saveFileManagerStateRequestSchema } from "@wrapt/contracts";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";
import type { PluginHostApi } from "./code-host-api.js";

export type PluginWorkspaceServices = Pick<RouteServices, "projects" | "projectBrowser" | "projectFiles" | "fileManager">;

export function registerWorkspacePluginApi(api: PluginHostApi, services: PluginWorkspaceServices): void {
  const projectId = z.object({ projectId: z.string().min(1) });
  api.register("projects.list", { description: "Projekte auflisten", mutates: false, hookable: true, output: projectsResponseSchema, handler: () => services.projects.list() });
  api.register("projects.get", { description: "Projekt lesen", mutates: false, hookable: true, input: projectId, output: projectResponseSchema, handler: ({ projectId }) => services.projects.get(projectId) });
  api.register("projects.register", { description: "Lokales Projekt registrieren", mutates: true, hookable: true, input: registerProjectRequestSchema, output: registerProjectResponseSchema, handler: async ({ path }) => services.projects.register(await services.projectBrowser.resolveDirectory(path, false)) });
  api.register("projects.touch", { description: "Projektaktivität erfassen", mutates: true, hookable: true, input: projectId, output: projectActivityTouchResponseSchema, handler: ({ projectId }) => services.projects.touch(projectId) });
  api.register("projects.createFile", { description: "Projektdatei erstellen", mutates: true, hookable: true, input: projectId.extend({ file: createProjectFileRequestSchema }), output: projectFileResponseSchema, handler: ({ projectId, file }) => services.projectFiles.create(projectId, file) });
  api.register("filesystem.tree", { description: "Dateibaum im freigegebenen Bereich", mutates: false, hookable: true, input: z.object({ path: z.string().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }).default({}), output: filesystemTreeResponseSchema, handler: (input) => services.projectBrowser.tree({ ...(input.path ? { path: input.path } : {}), ...(input.cursor ? { cursor: input.cursor } : {}), ...(input.limit ? { limit: input.limit } : {}) }) });
  api.register("filesystem.read", { description: "Textdatei lesen", mutates: false, hookable: true, input: z.object({ path: z.string().min(1) }), output: fileManagerTextPreviewResponseSchema, handler: (input) => services.fileManager.textPreview(input) });
  api.register("filesystem.search", { description: "Dateien suchen", mutates: false, hookable: true, input: z.object({ q: z.string().min(1).max(200) }), output: fileManagerSearchResponseSchema, handler: ({ q }) => services.fileManager.search(q) });
  api.register("filesystem.state", { description: "Dateimanagerzustand lesen", mutates: false, hookable: true, handler: () => services.fileManager.state() });
  api.register("filesystem.saveState", { description: "Dateimanagerzustand speichern", mutates: true, hookable: true, input: saveFileManagerStateRequestSchema, handler: (input) => services.fileManager.saveState(input) });
  api.register("filesystem.rename", { description: "Datei umbenennen", mutates: true, hookable: true, input: fileManagerRenameRequestSchema, handler: async (input) => services.fileManager.response(await services.fileManager.rename(input)) });
  api.register("filesystem.move", { description: "Datei verschieben", mutates: true, hookable: true, input: fileManagerMoveRequestSchema, handler: async (input) => services.fileManager.response(await services.fileManager.move(input)) });
  api.register("filesystem.remove", { description: "Datei entfernen", mutates: true, hookable: true, input: fileManagerDeleteRequestSchema, handler: async ({ path }) => services.fileManager.response(await services.fileManager.remove({ path })) });
  api.register("filesystem.mkdir", { description: "Ordner erstellen", mutates: true, hookable: true, input: fileManagerMkdirRequestSchema, handler: async (input) => services.fileManager.response(await services.fileManager.mkdir(input)) });
}
