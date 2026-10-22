import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { HermesV2ClientMessage, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { FakeGateway } from "../fake-gateway.fixture.js";
import { GatewayPool } from "../pool.js";
import { registerHermesV2Routes } from "../routes.js";

export async function integrationFixture() {
  const root = await mkdtemp(join(tmpdir(), "hermes-v2-org-integration-"));
  const core = new FakeGateway(root);
  const deps = core.dependencies(await core.start());
  deps.identity = { allowedUsers: ["a", "b"] };
  deps.organizationOptions = { databasePath: join(root, "wrapt.sqlite"), homeDirectory: root };
  const paths: string[] = [];
  let custom: ((path: string) => unknown | Promise<unknown>) | undefined;
  const original = deps.dashboard.get;
  deps.dashboard.get = async (path) => {
    paths.push(path);
    const value = custom ? await custom(path) : undefined;
    if (value !== undefined) return value;
    if (path === "/api/profiles/active") return { active: "cli-other", current: "default" };
    if (path === "/api/profiles") return { profiles: [{ name: "default", path: root }] };
    const url = new URL(path, "http://fake");
    if (url.pathname === "/api/profiles/sessions") {
      const rows = [...core.sessions.values()].map((session) => ({ id: session.id, title: session.title, profile: "default", cwd: session.cwd }));
      const offset = Number(url.searchParams.get("offset")); const limit = Number(url.searchParams.get("limit"));
      return { sessions: rows.slice(offset, offset + limit), total: rows.length, errors: [], storage: {} };
    }
    const result = await original(path);
    return url.pathname.endsWith("/messages") ? { ...result as object, profile: "default" } : result;
  };
  core.resultHook = (method, _params, value) => {
    if (method === "session.active_list") return { sessions: [...core.sessions.values()].map((session) => ({ id: session.liveId, session_key: session.id, status: session.running ? "working" : "idle" })) };
    if (["session.resume", "session.activate", "session.create"].includes(method)) {
      const result = value as { info: Record<string, unknown> };
      return { ...result, info: { ...result.info, profile_name: "default" } };
    }
    return value;
  };
  const pool = new GatewayPool(deps);
  const app = Fastify({ logger: false });
  await app.register(websocket);
  await app.register(registerHermesV2Routes, { ...deps, pool, prefix: "/api/v1" });
  const frames = new Map<string, HermesV2ServerMessage[]>();
  function browser(owner = "a", id = owner, evidence = true) {
    const messages: HermesV2ServerMessage[] = []; frames.set(id, messages);
    const manager = pool.get(owner);
    manager.add({ id, readEvidence: evidence, send: (frame) => messages.push(frame) });
    return { manager, messages, id };
  }
  const message = (data: Omit<Extract<HermesV2ClientMessage, { op: "session.subscribe" }>, "v" | "id">): HermesV2ClientMessage => ({ v: 1, id: randomUUID(), ...data });
  const request = (url: string, payload?: unknown, owner = "a") => app.inject({ method: payload === undefined ? "GET" : "POST",
    url: `/api/v1${url}`, headers: { host: "workbench.test", origin: "http://workbench.test", "tailscale-user-login": owner }, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { root, core, deps, pool, app, paths, frames, browser, message, request, custom: (fn: typeof custom) => { custom = fn; },
    close: async () => { await app.close(); await core.close(); await rm(root, { recursive: true, force: true }); } };
}
