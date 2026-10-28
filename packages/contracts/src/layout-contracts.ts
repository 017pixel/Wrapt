import { z } from "zod";

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

export type Panel = z.infer<typeof panelSchema>;

export type PanelType = z.infer<typeof panelTypeSchema>;

export type WorkbenchGroup = z.infer<typeof workbenchGroupSchema>;

export type WorkbenchLayout = z.infer<typeof workbenchLayoutSchema>;

export type LayoutPage = z.infer<typeof layoutPageSchema>;

export type LayoutState = z.infer<typeof layoutStateSchema>;
