import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";

const httpEndpoint = {
    id: "workbench.agent-tasks.http.task",
    description: "Liest einen Agent Task.",
    provider: "workbench.agent-tasks.http-provider.task",
    requestSchema: "./schemas/task-request.json",
    responseSchema: "./schemas/task-response.json",
    maxRequestBytes: 64_000,
    maxResponseBytes: 256_000,
    timeoutMilliseconds: 10_000,
    rateLimit: { maxRequests: 60, windowMilliseconds: 60_000 },
    method: "GET",
    path: "/tasks/:taskId",
  } as const;
const rpcProcedure = {
    id: "workbench.agent-tasks.rpc.create",
    description: "Erstellt einen Agent Task.",
    provider: "workbench.agent-tasks.rpc-provider.create",
    requestSchema: "./schemas/create-task-request.json",
    responseSchema: "./schemas/create-task-response.json",
    maxRequestBytes: 64_000,
    maxResponseBytes: 256_000,
    timeoutMilliseconds: 10_000,
    rateLimit: { maxRequests: 30, windowMilliseconds: 60_000 },
    kind: "mutation",
  } as const;
const realtimeChannel = {
    id: "workbench.agent-tasks.realtime.tasks",
    description: "Synchronisiert Agent Tasks in Echtzeit.",
    provider: "workbench.agent-tasks.realtime-provider.tasks",
    scope: "project",
    maxMessageBytes: 64_000,
    maxConnectionsPerUser: 4,
    queue: {
      delivery: "reliable",
      highWaterMarkBytes: 128_000,
      maxQueueBytes: 1_000_000,
    },
    rateLimit: { maxMessages: 120, windowMilliseconds: 60_000 },
    heartbeat: {
      intervalMilliseconds: 30_000,
      timeoutMilliseconds: 10_000,
    },
    closeTimeoutMilliseconds: 2_000,
    direction: "bidirectional",
    clientMessageSchema: "./schemas/task-client-message.json",
    serverMessageSchema: "./schemas/task-server-message.json",
  } as const;

describe("Extension Manifest: protocols", () => {
  it("akzeptiert namespaced HTTP- und typisierte RPC-Contributions", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: { http: [httpEndpoint], rpc: [rpcProcedure] },
        }).success,
      ).toBe(true);
    });

  it("verlangt für HTTP/RPC eigene Provider und Server-Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            http: [
              {
                ...httpEndpoint,
                provider: "workbench.other.http-provider.task",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { ui: "./dist/ui.js" },
          contributes: { rpc: [rpcProcedure] },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte HTTP/RPC IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            http: [httpEndpoint],
            rpc: [{ ...rpcProcedure, id: httpEndpoint.id }],
          },
        }).success,
      ).toBe(false);
    });

  it("akzeptiert typisierte Realtime Channels", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: { realtime: [realtimeChannel] },
        }).success,
      ).toBe(true);
    });

  it("verlangt für Realtime eigene Provider und Server-Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            realtime: [
              {
                ...realtimeChannel,
                provider: "workbench.other.realtime-provider.tasks",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { ui: "./dist/ui.js" },
          contributes: { realtime: [realtimeChannel] },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte Realtime IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            http: [httpEndpoint],
            realtime: [{ ...realtimeChannel, id: httpEndpoint.id }],
          },
        }).success,
      ).toBe(false);
    });
});
