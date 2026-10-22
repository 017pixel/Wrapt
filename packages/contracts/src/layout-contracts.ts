import { z } from "zod";
import { isoDateSchema } from "./host-system.js";
import { previewPathSchema } from "./project-contracts.js";
import { usageProviderIdSchema } from "./usage-contracts.js";

export const WRAPT_LIMITS = {
  maxResidentTools: 10,
  maxVisibleGroups: 4,
  maxLayoutPages: 8,
  // Geparkte Routen im Browser (PersistentOutlet). Zehn decken jeden üblichen
  // Wechsel ab, ohne dass beliebig viele iframes und WebSockets offen bleiben.
  maxCachedRoutes: 10,
} as const;

// `notion` und `browser` bleiben als lesbare Legacy-Typen erhalten. Neue Knoten
// werden dafür nicht mehr angeboten, bestehende Arbeitsflächen dürfen sie aber
// nie verlieren.
export const panelTypeSchema = z.enum(["t3-code", "code-server", "preview", "browser", "terminal", "codex", "claude", "opencode", "files", "hermes", "notion"]);

export const panelSchema = z.object({
  id: z.string().min(1),
  type: panelTypeSchema,
  projectId: z.string().nullable(),
  previewId: z.string().nullable(),
  reloadKey: z.number().int().nonnegative(),
  // Nur noch ein Legacy-Feld früherer Browser-Panels. Optional, damit bestehende
  // gespeicherte Arbeitsflächen kompatibel bleiben.
  browserUrl: z.string().trim().min(1).max(2_048).optional(),
  // Tiefenlink-Ziel für T3-Panels: Pfad hinter dem Proxy-Präfix `/t3`,
  // z. B. `/umgebung/thread`. Optional, damit gespeicherte Arbeitsflächen
  // kompatibel bleiben. Leer steht für die T3-Startseite.
  t3Path: z.string().startsWith("/").max(512).optional(),
  // Zielordner für Code-Server-Panels, die aus eingebetteten Werkzeugen
  // (z. B. dem T3-„Open in VS Code"-Button) geöffnet werden. Ohne Wert öffnet
  // das Panel wie bisher das Projektverzeichnis. Optional, damit gespeicherte
  // Arbeitsflächen kompatibel bleiben.
  codeServerFolder: z.string().startsWith("/").min(1).max(2_048).optional(),
  // Der interne Pfad der offiziellen Hermes-SPA bleibt optional, damit alte
  // localStorage-Dokumente ohne Migration weiter gültig sind.
  hermesAdminPath: z.string().startsWith("/").max(512).optional(),
});

export const workbenchGroupSchema = z.object({
  id: z.string().min(1),
  panelIds: z.array(z.string().min(1)).max(WRAPT_LIMITS.maxResidentTools),
  activePanelId: z.string().nullable(),
});

export const workbenchLayoutSchema = z.enum(["single", "columns", "rows", "main-left", "grid"]);

export const layoutPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(48),
  groups: z.array(workbenchGroupSchema).min(1).max(WRAPT_LIMITS.maxVisibleGroups),
  focusedGroupId: z.string().min(1),
  layout: workbenchLayoutSchema,
  layoutSizes: z.record(
    z.string(),
    z.tuple([z.number().min(10).max(90), z.number().min(10).max(90)]),
  ),
});

export const layoutStateSchema = z
  .object({
    version: z.literal(4),
    selectedProjectId: z.string().nullable(),
    panels: z.array(panelSchema).max(WRAPT_LIMITS.maxResidentTools),
    pages: z.array(layoutPageSchema).min(1).max(WRAPT_LIMITS.maxLayoutPages),
    activePageId: z.string().min(1),
    maximizedPanelId: z.string().nullable(),
    focusedPanelId: z.string().nullable(),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.panels.map((panel) => panel.id));
    if (ids.size !== value.panels.length) {
      context.addIssue({ code: "custom", message: "Panel IDs müssen eindeutig sein." });
    }
    if (value.maximizedPanelId !== null && !ids.has(value.maximizedPanelId)) {
      context.addIssue({ code: "custom", message: "Maximiertes Panel ist nicht geöffnet." });
    }
    if (value.focusedPanelId !== null && !ids.has(value.focusedPanelId)) {
      context.addIssue({ code: "custom", message: "Fokussiertes Panel ist nicht geöffnet." });
    }

    const pageIds = new Set(value.pages.map((page) => page.id));
    if (pageIds.size !== value.pages.length || !pageIds.has(value.activePageId)) {
      context.addIssue({ code: "custom", message: "Arbeitsflächen müssen eindeutig sein und eine aktive Fläche besitzen." });
    }

    const assignedPanelIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const page of value.pages) {
      const ownGroupIds = new Set(page.groups.map((group) => group.id));
      if (!ownGroupIds.has(page.focusedGroupId)) {
        context.addIssue({ code: "custom", message: "Die fokussierte Gruppe gehört nicht zur Arbeitsfläche." });
      }
      for (const group of page.groups) {
        if (groupIds.has(group.id)) {
          context.addIssue({ code: "custom", message: "Gruppen-IDs müssen eindeutig sein." });
        }
        groupIds.add(group.id);
        if (group.activePanelId !== null && !group.panelIds.includes(group.activePanelId)) {
          context.addIssue({ code: "custom", message: "Der aktive Tab gehört nicht zu seiner Gruppe." });
        }
        for (const panelId of group.panelIds) {
          if (!ids.has(panelId) || assignedPanelIds.has(panelId)) {
            context.addIssue({ code: "custom", message: "Jedes Panel muss genau einer Gruppe zugeordnet sein." });
          }
          assignedPanelIds.add(panelId);
        }
      }
      for (const sizes of Object.values(page.layoutSizes)) {
        if (Math.abs(sizes[0] + sizes[1] - 100) > 0.5) {
          context.addIssue({ code: "custom", message: "Gespeicherte Panelgrößen müssen zusammen 100 ergeben." });
        }
      }
    }
    if (assignedPanelIds.size !== ids.size) {
      context.addIssue({ code: "custom", message: "Alle Panels müssen einer Arbeitsfläche zugeordnet sein." });
    }
  });

export const ORBIT_LIMITS = {
  maxBoards: 8,
  maxNodesPerBoard: 600,
  maxEdgesPerBoard: 1_200,
  maxToolNodesPerBoard: 96,
  maxDocumentBytes: 4 * 1024 * 1024,
} as const;

// Gemeinsame Grenzen für die sichtbare Orbit-Geometrie. UI und API müssen dieselbe
// Obergrenze verwenden, damit große Arbeitsflächen nicht erst lokal funktionieren
// und anschließend beim Autosave abgelehnt werden.
export const ORBIT_SIZE_LIMITS = {
  minWidth: 160,
  minHeight: 96,
  maxWidth: 20_000,
  maxHeight: 20_000,
} as const;

export const ORBIT_ASSET_LIMITS = {
  maxFileBytes: 100 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024 * 1024,
} as const;

export const orbitNodeTypeSchema = z.enum([
  "project",
  "tool",
  "previewGroup",
  "previewSlot",
  "note",
  "todo",
  "snippet",
  "file",
  "asset",
  "gallery",
  "fileGallery",
  "frame",
  "usage",
  "hermesStatus",
  "hermesTasks",
  "hermesCron",
  "hermesResults",
  "extension",
]);

export const orbitEdgeKindSchema = z.enum(["project", "manual", "runtime"]);

export const orbitPointSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});

export const orbitSizeSchema = z.object({
  width: z.number().finite().min(ORBIT_SIZE_LIMITS.minWidth).max(ORBIT_SIZE_LIMITS.maxWidth),
  height: z.number().finite().min(ORBIT_SIZE_LIMITS.minHeight).max(ORBIT_SIZE_LIMITS.maxHeight),
});

export const orbitBoundsSchema = z.object({
  minX: z.number().finite().min(-100_000).max(100_000),
  minY: z.number().finite().min(-100_000).max(100_000),
  maxX: z.number().finite().min(-100_000).max(100_000),
  maxY: z.number().finite().min(-100_000).max(100_000),
}).refine((bounds) => bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, {
  message: "Orbit-Grenzen müssen eine positive Fläche bilden.",
});

export const orbitNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: orbitNodeTypeSchema,
  title: z.string().trim().min(1).max(120),
  position: orbitPointSchema,
  size: orbitSizeSchema,
  projectId: z.string().max(120).nullable(),
  parentId: z.string().max(100).nullable(),
  runtimeId: z.string().max(100).nullable(),
  toolType: panelTypeSchema.nullable(),
  previewId: z.string().max(120).nullable(),
  previewLayout: z.enum(["1", "2", "3", "6"]).nullable().default(null),
  previewTarget: z.string().max(4_096).nullable().default(null),
  previewPath: previewPathSchema.default("/"),
  // `null` bedeutet ab Orbit v7 „Benutzerpräferenz verwenden“; ein expliziter Wert
  // bleibt slotgebunden. Dokumente bis v6 werden beim Laden auf "responsive" gehoben.
  previewDeviceId: z.string().max(80).nullable().default(null),
  previewOrientation: z.enum(["portrait", "landscape"]).default("portrait"),
  previewSlotId: z.number().int().min(1).max(128).nullable().default(null),
  // Stabile Storage-Identität eines Preview-Slots. Sie entscheidet serverseitig, ob eine
  // Slot-Origin ohne Reset wiederverwendet werden darf.
  previewStorageProfileId: z.string().uuid().nullable().default(null),
  previewIsolation: z.boolean().default(true),
  previewReferenceId: z.string().max(100).nullable().default(null),
  previewLastUsedAt: isoDateSchema.nullable().default(null),
  assetId: z.string().uuid().nullable().default(null),
  assetMimeType: z.string().max(160).nullable().default(null),
  assetBytes: z.number().int().nonnegative().nullable().default(null),
  provider: usageProviderIdSchema.nullable(),
  content: z.string().max(200_000),
  language: z.string().trim().max(40).nullable(),
  // Selbst gewählte Farbe (Hex). null = automatische Farbe aus der Projekt-ID.
  // Färbt den Knoten und die von ihm ausgehenden Verbindungen.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  hermesSourceFilter: z.enum(["all", "web", "telegram", "cron"]).default("all"),
  hermesStatusFilter: z.enum(["all", "success", "failed"]).default("all"),
  // Generischer Extension-Knoten (Phase 4): Extension- und Contribution-ID
  // bilden die Identität, der State bleibt vollständig erhalten, auch wenn
  // der Code fehlt oder deaktiviert ist.
  extensionId: z.string().max(128).nullable().default(null),
  contributionId: z.string().max(192).nullable().default(null),
  stateVersion: z.number().int().positive().nullable().default(null),
  state: z.record(z.string(), z.unknown()).default({}),
  // Verweis auf eine zentrale Notiz (Notizen-Feature). Nur Notiz-Knoten dürfen
  // ihn tragen; der Knoten zeigt dann Titel und Inhalt der Notiz.
  noteId: z.string().uuid().nullable().default(null),
  locked: z.boolean(),
  zIndex: z.number().int().min(0).max(10_000),
}).superRefine((node, context) => {
  if (node.type !== "note" && node.noteId !== null) {
    context.addIssue({ code: "custom", path: ["noteId"], message: "Nur Notiz-Knoten dürfen auf eine Notiz verweisen." });
  }
  if (node.type === "tool" && node.toolType === null) {
    context.addIssue({ code: "custom", message: "Werkzeugknoten benötigen einen Werkzeugtyp." });
  }
  if (node.type !== "tool" && node.toolType !== null) {
    context.addIssue({ code: "custom", message: "Nur Werkzeugknoten dürfen einen Werkzeugtyp besitzen." });
  }
  if (node.type === "usage" && node.provider === null) {
    context.addIssue({ code: "custom", message: "Nutzungsknoten benötigen einen Provider." });
  }
  if (node.type === "extension" && (node.extensionId === null || node.contributionId === null || node.stateVersion === null)) {
    context.addIssue({ code: "custom", message: "Extension-Knoten benötigen Extension-ID, Contribution-ID und State-Version." });
  }
  if (node.type !== "extension" && (node.extensionId !== null || node.contributionId !== null || node.stateVersion !== null)) {
    context.addIssue({ code: "custom", message: "Nur Extension-Knoten dürfen Extension-Metadaten besitzen." });
  }
  if (node.type === "asset" && (node.assetId === null || node.assetMimeType === null || node.assetBytes === null)) {
    context.addIssue({ code: "custom", message: "Medienknoten benötigen vollständige Asset-Metadaten." });
  }
  if (node.type !== "asset" && (node.assetId !== null || node.assetMimeType !== null || node.assetBytes !== null)) {
    context.addIssue({ code: "custom", message: "Nur Medienknoten dürfen Asset-Metadaten besitzen." });
  }
  if (node.hermesSourceFilter !== "all" && node.type !== "hermesTasks" && node.type !== "hermesResults") {
    context.addIssue({ code: "custom", path: ["hermesSourceFilter"], message: "Die Hermes-Quellenfilter gehören nur zu Hermes-Aufgaben oder -Ergebnissen." });
  }
  if (node.hermesStatusFilter !== "all" && node.type !== "hermesResults") {
    context.addIssue({ code: "custom", path: ["hermesStatusFilter"], message: "Der Hermes-Statusfilter gehört nur zu Hermes-Ergebnissen." });
  }
});

export const orbitEdgeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  kind: orbitEdgeKindSchema,
  label: z.string().trim().max(80).nullable(),
  sourceSide: z.enum(["left", "right"]).nullable().default(null),
  targetSide: z.enum(["left", "right"]).nullable().default(null),
  waypoints: z.array(orbitPointSchema).max(32).default([]),
});

export const orbitBoardSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().min(0.1).max(2.5),
  }),
  worldBounds: orbitBoundsSchema,
  nodes: z.array(orbitNodeSchema).max(ORBIT_LIMITS.maxNodesPerBoard),
  edges: z.array(orbitEdgeSchema).max(ORBIT_LIMITS.maxEdgesPerBoard),
}).superRefine((board, context) => {
  const nodeIds = new Set(board.nodes.map((node) => node.id));
  if (nodeIds.size !== board.nodes.length) {
    context.addIssue({ code: "custom", message: "Orbit-Knoten-IDs müssen eindeutig sein." });
  }
  if (board.nodes.filter((node) => node.type === "tool").length > ORBIT_LIMITS.maxToolNodesPerBoard) {
    context.addIssue({ code: "custom", message: "Zu viele Werkzeugknoten auf einer Arbeitsfläche." });
  }
  const edgeIds = new Set<string>();
  for (const edge of board.edges) {
    if (edgeIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      context.addIssue({ code: "custom", message: "Orbit-Verbindungen müssen eindeutig und vollständig sein." });
    }
    edgeIds.add(edge.id);
  }
});

export const ORBIT_DOCUMENT_VERSION = 8;

export const orbitWorkspaceSchema = z.object({
  // Version 6 und 7 bleiben lesbar; geschrieben wird v8. Die neuen Node-Felder
  // besitzen Defaults und benötigen keinen destruktiven Migrationsschritt.
  version: z.union([z.literal(6), z.literal(7), z.literal(8)]),
  activeBoardId: z.string().min(1).max(100),
  focusedNodeId: z.string().max(100).nullable(),
  boards: z.array(orbitBoardSchema).min(1).max(ORBIT_LIMITS.maxBoards),
}).superRefine((workspace, context) => {
  const boardIds = new Set(workspace.boards.map((board) => board.id));
  if (boardIds.size !== workspace.boards.length || !boardIds.has(workspace.activeBoardId)) {
      context.addIssue({ code: "custom", message: "Orbit-Boards müssen eindeutig sein und ein aktives Board besitzen." });
  }
  if (workspace.focusedNodeId !== null) {
    const activeBoard = workspace.boards.find((board) => board.id === workspace.activeBoardId);
    if (!activeBoard?.nodes.some((node) => node.id === workspace.focusedNodeId)) {
      context.addIssue({ code: "custom", message: "Der fokussierte Orbit-Knoten gehört nicht zur aktiven Fläche." });
    }
  }
});

export const orbitDocumentResponseSchema = z.object({
  document: orbitWorkspaceSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
  initialized: z.boolean(),
  syncIntervalMilliseconds: z.number().int().min(1_000).max(60_000),
});

export const saveOrbitDocumentRequestSchema = z.object({
  document: orbitWorkspaceSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export type Panel = z.infer<typeof panelSchema>;

export type PanelType = z.infer<typeof panelTypeSchema>;

export type WorkbenchGroup = z.infer<typeof workbenchGroupSchema>;

export type WorkbenchLayout = z.infer<typeof workbenchLayoutSchema>;

export type LayoutPage = z.infer<typeof layoutPageSchema>;

export type LayoutState = z.infer<typeof layoutStateSchema>;

export type OrbitNodeType = z.infer<typeof orbitNodeTypeSchema>;

export type OrbitEdgeKind = z.infer<typeof orbitEdgeKindSchema>;

export type OrbitPoint = z.infer<typeof orbitPointSchema>;

export type OrbitSize = z.infer<typeof orbitSizeSchema>;

export type OrbitBounds = z.infer<typeof orbitBoundsSchema>;

export type OrbitNode = z.infer<typeof orbitNodeSchema>;

export type OrbitEdge = z.infer<typeof orbitEdgeSchema>;

export type OrbitBoard = z.infer<typeof orbitBoardSchema>;

export type OrbitWorkspace = z.infer<typeof orbitWorkspaceSchema>;

export type OrbitDocumentResponse = z.infer<typeof orbitDocumentResponseSchema>;

export type SaveOrbitDocumentRequest = z.infer<typeof saveOrbitDocumentRequestSchema>;
