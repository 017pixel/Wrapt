import type { HermesV2Event, HermesV2ServerMessage, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import type { WorkbenchIdentityOptions } from "../../security/workbench-identity.js";
import type { HermesV2Policy } from "./policy.js";
import type { OrganizationService, OrganizationOptions } from "./organization/service.js";

export interface DashboardReader {
  get(path: string): Promise<unknown>;
  token: { get(force?: boolean): Promise<string>; invalidate(): void };
}
export interface DashboardWriter {
  post(path: string, body?: unknown): Promise<unknown>;
  put(path: string, body?: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
}
export interface GatewayDependencies {
  authority: string;
  enabled: () => boolean;
  identity: WorkbenchIdentityOptions;
  dashboard: DashboardReader;
  allowedRoots: readonly string[];
  deniedRoots?: readonly string[];
  resolveProjectCwd(projectId: string | null): Promise<string>;
  policy?: Partial<HermesV2Policy>;
  organizationOptions?: OrganizationOptions;
  organization?: OrganizationService;
  resources?: { writer?: DashboardWriter; readUpdateStatus?: () => unknown | Promise<unknown> };
  onAttention?: (attention: {
    principal: string; sessionId: string; kind: "completed" | "request" | "error";
    eventId: string; completedAt: number | null;
    cursor: { epoch: string; liveId: string; seq: number } | null;
  }) => void;
}
export interface BrowserConnection {
  id: string;
  readEvidence?: boolean;
  composer?: boolean;
  work?: boolean;
  resources?: boolean;
  send(message: HermesV2ServerMessage): void;
}
export interface SessionRecord {
  storedId: string;
  canonicalId: string;
  liveId: string | null;
  epoch: string;
  snapshot: HermesV2Snapshot;
  ownedBinding: { epoch: string; liveId: string } | null;
  turnId: string;
  seq: number;
  hydrating: boolean;
  hydrationRevision?: number;
  buffered: UpstreamEvent[];
  bufferedBytes: number;
  backgroundActive: boolean | null;
  backgroundProtected?: boolean;
  profileName?: string | null;
  contextRevision?: number;
  subscribers: Set<string>;
}
export interface UpstreamEvent {
  type: string;
  session_id?: string | undefined;
  seq?: number | undefined;
  payload?: Record<string, unknown> | undefined;
}
export interface UpstreamRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}
export type ConnectionState = "connecting" | "online" | "reconnecting" | "offline" | "incompatible";
export type GatewayFrame = { kind: "event"; event: UpstreamEvent } | { kind: "request"; request: UpstreamRequest };
export type EventSink = (event: HermesV2Event) => void;
