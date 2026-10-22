import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { HermesV2ServerMessage, HermesV2Message } from "@wrapt/contracts/hermes-v2";
import { normalizeHistory } from "../normalize-history.js";
import { OrganizationRepository } from "./repository.js";
import { ReadProjection } from "./projection.js";
import { EvidenceRegistry } from "./evidence.js";
import { OrganizationActions } from "./actions.js";
import { organizationView } from "./views.js";
import { acknowledge } from "./acks.js";

export const uid = (n: number) => n.toString(16).padStart(32, "0");
export const rawRow = (n: number, patch: Record<string, unknown> = {}) => ({ id: n, role: "assistant", content: `Antwort ${n}`,
  message_uid: uid(n), finish_reason: "stop", timestamp: 1_800_000_000, tool_calls: [], ...patch });
export async function organizationFixture() {
  const root = await mkdtemp(join(tmpdir(), "hermes-v2-organization-"));
  let time = 1_800_000_000_000;
  const now = () => time;
  const changes: Array<{ owner: string; session: string; revision: number }> = [];
  const repo = new OrganizationRepository(join(root, "wrapt.sqlite"), (owner, session, revision) => changes.push({ owner, session, revision }), now);
  const scope = { id: "scope", profile: "default", home: root };
  const evidence = new EvidenceRegistry(now);
  const projection = new ReadProjection(repo, evidence, now);
  let requests = false;
  const actions = new OrganizationActions(repo, () => requests, now);
  function project(raw: unknown[], owner = "a", session = "session", optedIn = true) {
    const messages = normalizeHistory(raw, session);
    projection.history(scope, session, raw, messages);
    const frame: HermesV2ServerMessage = { v: 1, type: "result", id: randomUUID(), op: "history.read", data: { sessionId: session, messages, offset: 0, returned: raw.length, hasMore: false } };
    const output = projection.frame(owner, frame, optedIn);
    if (output.type !== "result" || output.op !== "history.read") throw new Error("Falscher Testframe");
    return { messages: output.data.messages, originals: messages, frame };
  }
  function handle(message: HermesV2Message): string { if (!message.readEvidence) throw new Error("Lesebeleg fehlt"); return message.readEvidence; }
  const source = (n: number, session = "session", namespace: "answer" | "error" = "answer") => repo.source(scope.id, session, namespace, `uid:${uid(n)}`, { uid: uid(n) });
  const fact = (n: number, kind: "new-answer" | "live-turn-end" | "decision-error" = "new-answer", completedAt: number | null = null) => repo.transaction(() => repo.fact(source(n, "session", kind === "decision-error" ? "error" : "answer"), kind, now(), completedAt));
  const view = (owner = "a", session = "session") => organizationView(repo, owner, scope.id, session, now());
  const read = (handles: string[], owner = "a", session = "session") => acknowledge(repo, evidence, owner, scope.id, { sessionId: session, evidence: handles }, now());
  return { root, repo, scope, now, changes, evidence, projection, actions, project, handle, source, fact, view, read,
    advance: (ms: number) => { time += ms; }, requests: (open: boolean) => { requests = open; },
    close: async () => { repo.close(); actions.clear(); evidence.clear(); await rm(root, { recursive: true, force: true }); } };
}
