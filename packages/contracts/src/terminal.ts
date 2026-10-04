import { z } from "zod";
import { absoluteFilesystemPathSchema } from "./filesystem-path.js";

const isoDateSchema = z.iso.datetime({ offset: true });

export const terminalKindSchema = z.enum(["shell", "codex", "opencode", "claude"]);
export const terminalSessionStatusSchema = z.enum(["starting", "running", "exited", "interrupted", "closed"]);
export const terminalSessionSchema = z.object({
  id: z.string().uuid(),
  runtimeId: z.string().uuid(),
  kind: terminalKindSchema,
  mode: z.enum(["agent", "login"]),
  projectId: z.string().nullable(),
  cwd: absoluteFilesystemPathSchema,
  pid: z.number().int().nonnegative(),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(300),
  status: terminalSessionStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  exitCode: z.number().int().nullable(),
  exitSignal: z.number().int().nullable(),
  supervisor: z.enum(["tmux", "direct"]),
  managed: z.boolean(),
  connectedClients: z.number().int().nonnegative(),
});
export const terminalSessionsResponseSchema = z.object({ sessions: z.array(terminalSessionSchema), updatedAt: isoDateSchema });
export const terminalTabSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().nullable(),
  kind: terminalKindSchema,
  initialCwd: absoluteFilesystemPathSchema.nullable().default(null),
});
const canonicalTerminalAreaSchema = z.object({
  id: z.string().min(1).max(160),
  tabs: z.array(terminalTabSchema).max(12),
  activeTabId: z.string().uuid().nullable(),
  splitTabIds: z.tuple([z.string().uuid(), z.string().uuid()]).nullable(),
  splitSizes: z.tuple([z.number().min(20).max(80), z.number().min(20).max(80)]),
});
export const terminalAreaSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || "splitTabIds" in input) return input;
  const legacy = input as { activeTabId?: unknown; splitTabId?: unknown };
  const activeTabId = typeof legacy.activeTabId === "string" ? legacy.activeTabId : null;
  const splitTabId = typeof legacy.splitTabId === "string" ? legacy.splitTabId : null;
  return {
    ...input,
    splitTabIds: activeTabId && splitTabId && activeTabId !== splitTabId
      ? [activeTabId, splitTabId]
      : null,
  };
}, canonicalTerminalAreaSchema);
export const terminalWorkspaceSchema = z.object({
  version: z.literal(1),
  areas: z.record(z.string(), terminalAreaSchema),
}).superRefine((workspace, context) => {
  const tabIds = new Set<string>();
  for (const [areaKey, area] of Object.entries(workspace.areas)) {
    if (area.id !== areaKey) {
      context.addIssue({ code: "custom", path: ["areas", areaKey, "id"], message: "Bereichsschlüssel und Bereichs-ID müssen übereinstimmen." });
    }
    const ownIds = new Set<string>();
    for (const tab of area.tabs) {
      if (ownIds.has(tab.id) || tabIds.has(tab.id)) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "tabs"], message: "Terminal-Tab-IDs müssen global eindeutig sein." });
      }
      ownIds.add(tab.id);
      tabIds.add(tab.id);
    }
    if (area.activeTabId !== null && !ownIds.has(area.activeTabId)) {
      context.addIssue({ code: "custom", path: ["areas", areaKey, "activeTabId"], message: "Der aktive Tab gehört nicht zu diesem Bereich." });
    }
    if (area.splitTabIds !== null) {
      if (area.splitTabIds[0] === area.splitTabIds[1]) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "splitTabIds"], message: "Die beiden Terminal-Panes müssen verschieden sein." });
      }
      if (!area.splitTabIds.every((tabId) => ownIds.has(tabId))) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "splitTabIds"], message: "Ein geteilter Tab gehört nicht zu diesem Bereich." });
      }
      if (area.activeTabId !== null && !area.splitTabIds.includes(area.activeTabId)) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "activeTabId"], message: "Der fokussierte Tab muss in einem sichtbaren Pane liegen." });
      }
    }
    if (Math.abs(area.splitSizes[0] + area.splitSizes[1] - 100) > 0.5) {
      context.addIssue({ code: "custom", path: ["areas", areaKey, "splitSizes"], message: "Die Splitgrößen müssen zusammen 100 ergeben." });
    }
  }
});
// ---------------------------------------------------------------------------
// TerminalWorkspace V2: Ordner, Pins, Persistence, Pane-Layout
// ---------------------------------------------------------------------------
export const terminalEntrySchema = z.object({
  id: z.string().min(1).max(160),
  // Noch nicht gestartete Terminals besitzen keine Runtime-ID.
  runtimeId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  parentFolderId: z.string().min(1).max(160).nullable(),
  sortOrder: z.number().int().nonnegative(),
  pinned: z.boolean(),
  persistent: z.boolean(),
  kind: terminalKindSchema,
  projectId: z.string().nullable(),
  initialCwd: absoluteFilesystemPathSchema.nullable().default(null),
});
export const terminalFolderSchema = z.object({
  id: z.string().min(1).max(160),
  parentFolderId: z.string().min(1).max(160).nullable(),
  name: z.string().min(1).max(200),
  sortOrder: z.number().int().nonnegative(),
  collapsed: z.boolean(),
});
export const terminalPaneSchema = z.object({
  type: z.literal("pane"),
  id: z.string().min(1).max(160),
  runtimeId: z.string().uuid(),
});
export const terminalPaneLayoutSchema = z.discriminatedUnion("type", [
  terminalPaneSchema,
  z.object({
    type: z.literal("split"),
    id: z.string().min(1).max(160),
    orientation: z.literal("horizontal"),
    sizes: z.array(z.number().min(20).max(80)).min(2).max(4),
    children: z.array(terminalPaneSchema).min(2).max(4),
  }),
]);
export const terminalAreaLayoutSchema = z.object({
  paneLayout: terminalPaneLayoutSchema.nullable(),
  focusedPaneId: z.string().min(1).max(160).nullable(),
});
export const terminalWorkspaceV2Schema = z.object({
  version: z.literal(2),
  entries: z.array(terminalEntrySchema),
  folders: z.array(terminalFolderSchema),
  // Jede Terminalfläche (Standalone-Seite, CLI-Seiten, ToolPanel-Panels)
  // besitzt ihr eigenes Pane-Layout; Organisation (Entries/Folders) ist global.
  areaLayouts: z.record(z.string().min(1).max(160), terminalAreaLayoutSchema),
}).superRefine((workspace, context) => {
  const entryIds = new Set(workspace.entries.map((entry) => entry.id));
  const folderIds = new Set(workspace.folders.map((folder) => folder.id));
  const allIds = new Set([...entryIds, ...folderIds]);
  if (allIds.size !== entryIds.size + folderIds.size) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Terminal- und Ordner-IDs müssen disjunkt sein." });
  }
  for (const entry of workspace.entries) {
    if (entry.parentFolderId !== null && !folderIds.has(entry.parentFolderId)) {
      context.addIssue({ code: "custom", path: ["entries"], message: "Der übergeordnete Ordner eines Terminals existiert nicht." });
    }
  }
  for (const folder of workspace.folders) {
    if (folder.parentFolderId !== null && !folderIds.has(folder.parentFolderId)) {
      context.addIssue({ code: "custom", path: ["folders"], message: "Der übergeordnete Ordner existiert nicht." });
    }
  }
  const collectPanes = (node: z.infer<typeof terminalPaneLayoutSchema>, paneIds: Set<string>) => {
    if (node.type === "pane") paneIds.add(node.id);
    else for (const child of node.children) collectPanes(child, paneIds);
  };
  for (const [areaKey, areaLayout] of Object.entries(workspace.areaLayouts)) {
    const paneIds = new Set<string>();
    if (areaLayout.paneLayout) collectPanes(areaLayout.paneLayout, paneIds);
    if (areaLayout.focusedPaneId !== null && !paneIds.has(areaLayout.focusedPaneId)) {
      context.addIssue({ code: "custom", path: ["areaLayouts", areaKey, "focusedPaneId"], message: "Der fokussierte Pane liegt nicht im Layout." });
    }
  }
});

export const terminalEntryPatchSchema = z.object({
  runtimeId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  parentFolderId: z.string().min(1).max(160).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  pinned: z.boolean().optional(),
  persistent: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  initialCwd: absoluteFilesystemPathSchema.nullable().optional(),
});
export const terminalFolderPatchSchema = z.object({
  parentFolderId: z.string().min(1).max(160).nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  collapsed: z.boolean().optional(),
});
export const terminalWorkspaceOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createEntry"), entry: terminalEntrySchema }),
  z.object({ type: z.literal("updateEntry"), id: z.string().min(1).max(160), patch: terminalEntryPatchSchema }),
  z.object({ type: z.literal("deleteEntry"), id: z.string().min(1).max(160) }),
  z.object({ type: z.literal("createFolder"), folder: terminalFolderSchema }),
  z.object({ type: z.literal("updateFolder"), id: z.string().min(1).max(160), patch: terminalFolderPatchSchema }),
  // Kinder wandern beim Löschen in `moveChildrenTo` (oder bleiben ohne Ziel).
  z.object({ type: z.literal("deleteFolder"), id: z.string().min(1).max(160), moveChildrenTo: z.string().min(1).max(160).nullable() }),
  z.object({ type: z.literal("setPaneLayout"), areaId: z.string().min(1).max(160), layout: terminalPaneLayoutSchema.nullable() }),
  z.object({ type: z.literal("setFocusedPane"), areaId: z.string().min(1).max(160), paneId: z.string().min(1).max(160).nullable() }),
]);
export const terminalWorkspaceOpsRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  operations: z.array(terminalWorkspaceOperationSchema).max(50),
});
export type TerminalEntry = z.infer<typeof terminalEntrySchema>;
export type TerminalEntryPatch = z.infer<typeof terminalEntryPatchSchema>;
export type TerminalFolder = z.infer<typeof terminalFolderSchema>;
export type TerminalFolderPatch = z.infer<typeof terminalFolderPatchSchema>;
export type TerminalAreaLayout = z.infer<typeof terminalAreaLayoutSchema>;
export type TerminalPaneLayout = z.infer<typeof terminalPaneLayoutSchema>;
export type TerminalWorkspaceV2 = z.infer<typeof terminalWorkspaceV2Schema>;
export type TerminalWorkspaceOperation = z.infer<typeof terminalWorkspaceOperationSchema>;

export const terminalWorkspaceResponseSchema = z.object({
  document: z.union([terminalWorkspaceSchema, terminalWorkspaceV2Schema]),
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
});
export const saveTerminalWorkspaceRequestSchema = z.object({
  document: z.union([terminalWorkspaceSchema, terminalWorkspaceV2Schema]),
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export type TerminalKind = z.infer<typeof terminalKindSchema>;
export type TerminalSessionStatus = z.infer<typeof terminalSessionStatusSchema>;
export type TerminalSession = z.infer<typeof terminalSessionSchema>;
export type TerminalSessionsResponse = z.infer<typeof terminalSessionsResponseSchema>;
export type TerminalTab = z.infer<typeof terminalTabSchema>;
export type TerminalArea = z.infer<typeof terminalAreaSchema>;
export type TerminalWorkspace = z.infer<typeof terminalWorkspaceSchema>;
export type TerminalWorkspaceResponse = z.infer<typeof terminalWorkspaceResponseSchema>;
export type SaveTerminalWorkspaceRequest = z.infer<typeof saveTerminalWorkspaceRequestSchema>;
export type TerminalWorkspaceOpsRequest = z.infer<typeof terminalWorkspaceOpsRequestSchema>;
