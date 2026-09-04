import { z } from "zod";

// Die Liste spiegelt die öffentlichen Host-Surfaces aus
// @wrapt/extension-contracts. Sie lebt hier zusätzlich, damit die zentrale
// Wrapt-Konfiguration ohne Abhängigkeit auf Frontend-Runtime-Typen validiert wird.
export const contextMenuConfigSurfaces = [
  "host.context-menu.project",
  "host.context-menu.file",
  "host.context-menu.directory",
  "host.context-menu.orbit-node",
  "host.context-menu.orbit-pane",
  "host.context-menu.preview",
  "host.context-menu.terminal",
  "host.context-menu.git",
  "host.context-menu.agent-session",
  "host.context-menu.browser",
  "host.context-menu.tool",
  "host.context-menu.statusbar",
  "host.context-menu.empty",
  "host.context-menu.extensions",
] as const;

export const contextMenuConfigSurfaceSchema = z.enum(contextMenuConfigSurfaces);
export const contextMenuSurfaceSettingsSchema = z.object({
  enabled: z.boolean().default(true),
});

export const contextMenuConfigSchema = z.object({
  enabled: z.boolean().default(true),
  quickActions: z.object({
    mode: z.enum(["auto", "manual"]).default("auto"),
    manual: z.array(z.string().trim().min(1)).max(3).default([]),
  }).prefault({}),
  surfaces: z.partialRecord(
    contextMenuConfigSurfaceSchema,
    contextMenuSurfaceSettingsSchema,
  ).default({}),
  statusBar: z.object({
    fontSizePx: z.number().min(10).max(20).default(12),
    alwaysShowLimits: z.boolean().default(false),
  }).prefault({}),
}).prefault({});

export const contextMenuConfigResponseSchema = z.object({
  contextMenu: contextMenuConfigSchema,
});

export const defaultContextMenuConfig = contextMenuConfigSchema.parse({});

export type ContextMenuConfigSurface = z.infer<typeof contextMenuConfigSurfaceSchema>;
export type ContextMenuConfig = z.infer<typeof contextMenuConfigSchema>;
export type ContextMenuConfigResponse = z.infer<typeof contextMenuConfigResponseSchema>;
