import { normalizePreviewTarget } from "./previewTargets";

export interface PreviewLiveWindowRouteInput {
  projectId: string;
  port: number;
  path: string;
  title: string;
  sessionKey: string;
  previewNodeId: string | null;
  requestedSlotId: number | null;
  isolate: boolean;
  storageProfileId: string | null;
}

const fnvMask = 0xffff_ffff_ffff_ffffn;

function fnv1a64(value: string, offset: bigint): string {
  let hash = offset;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 0x100_0000_01b3n) & fnvMask;
  }
  return hash.toString(16).padStart(16, "0");
}

function canonicalPreviewTarget(value: string): string {
  const target = normalizePreviewTarget(value);
  if (!target) return `invalid:${value.trim()}`;
  if (target.kind === "local") return `local:${target.port}${target.path}`;
  return `external:${target.url}`;
}

export interface OrbitPreviewSessionIdentity {
  projectId: string | null;
  previewTarget: string | null;
  storageProfileId?: string | null;
  previewStorageProfileId?: string | null;
  /** Wird absichtlich nicht gehasht: Die Zuweisung ändert null nachträglich in eine Slotnummer. */
  previewSlotId?: number | null;
}

export function orbitPreviewSessionKey(input: OrbitPreviewSessionIdentity): string {
  const storageProfileId = input.previewStorageProfileId !== undefined
    ? input.previewStorageProfileId
    : input.storageProfileId;
  const identity = JSON.stringify([
    input.projectId?.trim() || null,
    canonicalPreviewTarget(input.previewTarget ?? ""),
    storageProfileId?.trim() || null,
  ]);
  const digest = `${fnv1a64(identity, 0xcbf2_9ce4_8422_2325n)}${fnv1a64(identity, 0x8422_2325_cbf2_9ce4n)}`;
  return `preview-runtime:${digest}`;
}

export function parsePreviewLiveWindowSearch(search: string): PreviewLiveWindowRouteInput | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("project")?.trim() ?? "";
  const port = Number(params.get("port"));
  const path = params.get("path") ?? "/";
  const target = normalizePreviewTarget(`http://127.0.0.1:${port}${path}`);
  if (!projectId || target?.kind !== "local" || target.port < 1 || target.port > 65_535) return null;

  const previewNodeId = params.get("node")?.trim() || null;
  const suppliedSessionKey = params.get("session")?.trim();
  const sessionKey = suppliedSessionKey && suppliedSessionKey.length <= 160
    ? suppliedSessionKey
    : orbitPreviewSessionKey({
      projectId,
      previewTarget: `${target.port}${target.path}`,
      storageProfileId: params.get("storage"),
    });
  const slot = Number(params.get("slot"));
  const requestedSlotId = Number.isSafeInteger(slot) && slot > 0 ? slot : null;
  const storageProfileId = params.get("storage")?.trim() || null;

  return {
    projectId,
    port: target.port,
    path: target.path,
    title: params.get("title")?.slice(0, 120) || "Development Preview",
    sessionKey,
    previewNodeId,
    requestedSlotId,
    isolate: params.get("isolate") === "1",
    storageProfileId,
  };
}

// Preview-Gruppen lassen sich als eigenständiges Browserfenster öffnen: alle
// Slots nebeneinander, ohne Orbit-Navigation, damit sich Geräte direkt
// vergleichen lassen.
export function previewGroupWindowUrl(groupId: string, origin = window.location.origin): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return new URL(`${base}/previews/fenster/${encodeURIComponent(groupId)}`, origin).toString();
}

export function previewGroupSnapshotKey(groupId: string): string {
  return `wrapt:preview-group-snapshot:${groupId}`;
}

export function openPreviewGroupWindow(groupId: string, document?: unknown): void {
  if (document !== undefined) {
    try { window.localStorage.setItem(previewGroupSnapshotKey(groupId), JSON.stringify({ document, savedAt: Date.now() })); } catch { /* Serverzustand bleibt der Fallback. */ }
  }
  const width = Math.max(640, Math.round(window.screen.availWidth || 1_280));
  const height = Math.max(480, Math.round(window.screen.availHeight || 800));
  const features = `popup=yes,noopener=yes,noreferrer=yes,width=${width},height=${height},left=0,top=0`;
  const opened = window.open(previewGroupWindowUrl(groupId), `wrapt-preview-${groupId}`, features);
  // Blockiert der Browser Popups, bleibt der Tab-Fallback als sichtbarer Weg.
  if (!opened) window.open(previewGroupWindowUrl(groupId), "_blank", "noopener,noreferrer");
}
