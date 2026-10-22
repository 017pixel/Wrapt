import type { ChatErrorInfo } from "./chat-types";
import type { HermesV2Sidebar, HermesV2SidebarOptions } from "./sidebar-types";
import type { ChatReadEvidence } from "./chat-read-evidence";

export interface OrganizationOwner {
  id: string;
  options: HermesV2SidebarOptions;
  mounted: boolean;
  generation: number;
  query: string;
  ids: string[];
  localIds: Set<string>;
  projectMembers: Map<string, { projectId: string; locationRevision: number }>;
  loading: boolean;
  hasMore: boolean;
  nextOffset: number | null;
  partial: boolean;
  limitReached: boolean;
  error: ChatErrorInfo | null;
  busy: Set<string>;
  undo: { handle: string; expiresAt: number } | null;
  queryGeneration: number;
  queryAbort: AbortController | null;
  read: ChatReadEvidence | null;
  view: HermesV2Sidebar | null;
}
export function newOrganizationOwner(options: HermesV2SidebarOptions): OrganizationOwner {
  return { id: options.ownerId, options, mounted: true, generation: 0, query: "", ids: [], localIds: new Set(), projectMembers: new Map(),
    loading: false, hasMore: true, nextOffset: 0, partial: true, limitReached: false,
    error: null, busy: new Set(), undo: null, queryGeneration: 0, queryAbort: null, read: null, view: null };
}
