import type { OrbitEdge, OrbitNode, PanelType } from "@wrapt/contracts";
import { generateId } from "../lib/id";

/**
 * Knoten-Fabrik des Orbits: Eingabeobjekte werden zu vollständigen Orbit-Knoten
 * normalisiert. Bewusst eigenes Modul, damit `stores/orbit.ts` als Store-Datei
 * nicht weiter wächst.
 */

export const ORBIT_DEFAULT_SIZE_SCALE = 1.25;

export function orbitDefaultSize(width: number, height: number) {
  return {
    width: Math.round(width * ORBIT_DEFAULT_SIZE_SCALE),
    height: Math.round(height * ORBIT_DEFAULT_SIZE_SCALE),
  };
}

export interface AddOrbitNodeInput {
  type: OrbitNode["type"];
  title: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  projectId?: string | null;
  parentId?: string | null;
  runtimeId?: string | null;
  toolType?: PanelType | null;
  previewId?: string | null;
  previewLayout?: "1" | "2" | "3" | "6" | null;
  previewTarget?: string | null;
  previewPath?: string;
  previewDeviceId?: string | null;
  previewOrientation?: "portrait" | "landscape";
  previewSlotId?: number | null;
  previewStorageProfileId?: string | null;
  previewIsolation?: boolean;
  previewReferenceId?: string | null;
  previewLastUsedAt?: string | null;
  assetId?: string | null;
  assetMimeType?: string | null;
  assetBytes?: number | null;
  provider?: "codex" | "opencode" | "claude" | null;
  content?: string;
  language?: string | null;
  hermesSourceFilter?: "all" | "web" | "telegram" | "cron";
  hermesStatusFilter?: "all" | "success" | "failed";
  extensionId?: string | null;
  contributionId?: string | null;
  stateVersion?: number | null;
  noteId?: string | null;
  state?: Record<string, unknown>;
}

export function orbitDefaultNodeSize(type: OrbitNode["type"], toolType?: PanelType | null) {
  if (type === "project") return orbitDefaultSize(240, 170);
  if (type === "frame") return orbitDefaultSize(680, 440);
  if (type === "previewGroup") return orbitDefaultSize(880, 420);
  if (type === "previewSlot") return orbitDefaultSize(480, 360);
  if (type === "tool") return toolType === "terminal" || toolType === "codex" || toolType === "claude" || toolType === "opencode"
    ? orbitDefaultSize(620, 380)
    : orbitDefaultSize(720, 460);
  if (type === "usage") return orbitDefaultSize(340, 230);
  if (type === "hermesStatus") return orbitDefaultSize(320, 260);
  if (type === "hermesTasks") return orbitDefaultSize(380, 300);
  if (type === "hermesCron") return orbitDefaultSize(380, 320);
  if (type === "hermesResults") return orbitDefaultSize(400, 380);
  if (type === "todo") return orbitDefaultSize(390, 300);
  if (type === "snippet") return orbitDefaultSize(420, 260);
  if (type === "asset") return orbitDefaultSize(420, 300);
  if (type === "gallery" || type === "fileGallery") return orbitDefaultSize(960, 680);
  return orbitDefaultSize(340, 220);
}

export function nodeFromInput(input: AddOrbitNodeInput, zIndex: number): OrbitNode {
  return {
    id: generateId(),
    type: input.type,
    title: input.title.trim().slice(0, 120) || "Unbenannt",
    position: input.position,
    size: input.size ?? orbitDefaultNodeSize(input.type, input.toolType),
    projectId: input.projectId ?? null,
    parentId: input.parentId ?? null,
    runtimeId: input.runtimeId ?? (input.type === "tool" ? generateId() : null),
    toolType: input.type === "tool" ? (input.toolType ?? "terminal") : null,
    previewId: input.previewId ?? null,
    previewLayout: input.type === "previewGroup" ? (input.previewLayout ?? "1") : null,
    previewTarget: input.type === "previewSlot" ? (input.previewTarget ?? null) : null,
    previewPath: input.previewPath ?? "/",
    // `null` erbt ab v7 die Benutzerpräferenz (Standard iPhone 13).
    previewDeviceId: input.type === "previewSlot" ? (input.previewDeviceId ?? null) : null,
    previewOrientation: input.previewOrientation ?? "portrait",
    previewSlotId: input.type === "previewSlot" ? (input.previewSlotId ?? null) : null,
    previewStorageProfileId: input.type === "previewSlot"
      ? (input.previewStorageProfileId === undefined ? generateId() : input.previewStorageProfileId)
      : null,
    previewIsolation: input.previewIsolation ?? true,
    previewReferenceId: input.previewReferenceId ?? null,
    previewLastUsedAt: input.previewLastUsedAt ?? null,
    assetId: input.type === "asset" ? (input.assetId ?? null) : null,
    assetMimeType: input.type === "asset" ? (input.assetMimeType ?? null) : null,
    assetBytes: input.type === "asset" ? (input.assetBytes ?? null) : null,
    provider: input.type === "usage" ? (input.provider ?? "codex") : null,
    content: input.content ?? "",
    language: input.language ?? (input.type === "snippet" ? "typescript" : null),
    color: null,
    hermesSourceFilter: input.hermesSourceFilter ?? "all",
    hermesStatusFilter: input.hermesStatusFilter ?? "all",
    extensionId: input.type === "extension" ? (input.extensionId ?? null) : null,
    contributionId: input.type === "extension" ? (input.contributionId ?? null) : null,
    stateVersion: input.type === "extension" ? (input.stateVersion ?? 1) : null,
    state: input.type === "extension" ? (input.state ?? {}) : {},
    noteId: input.type === "note" ? (input.noteId ?? null) : null,
    locked: false,
    zIndex,
  };
}

export function connectProject(nodes: OrbitNode[], newNode: OrbitNode): OrbitEdge[] {
  if (!newNode.projectId || newNode.type === "project") return [];
  const hub = nodes.find((node) => node.type === "project" && node.projectId === newNode.projectId);
  return hub ? [{ id: generateId(), source: hub.id, target: newNode.id, kind: "project", label: "gehört zu", sourceSide: null, targetSide: null, waypoints: [] }] : [];
}
