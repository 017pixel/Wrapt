import {
  workspaceProbeResponseSchema,
  workspaceRegistryResponseSchema,
  type SaveWorkspaceRegistryRequest,
  type WorkspaceRegistryResponse,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const workspacesApi = {
  workspaceRegistry: (signal?: AbortSignal) => request("/workspaces/registry", workspaceRegistryResponseSchema, signal),
  saveWorkspaceRegistry: (body: SaveWorkspaceRegistryRequest) => mutate("/workspaces/registry", "PUT", workspaceRegistryResponseSchema, body),
  probeWorkspace: (url: string) => mutate("/workspaces/probe", "POST", workspaceProbeResponseSchema, { url }),
};

export type { WorkspaceRegistryResponse };
