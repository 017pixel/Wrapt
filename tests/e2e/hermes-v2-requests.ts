import { randomUUID } from "node:crypto";
import {
  hermesV2RequestSchema,
  type HermesV2ClientMessage, type HermesV2Event, type HermesV2Request,
  type HermesV2Response, type HermesV2ServerMessage, type HermesV2Snapshot,
} from "../../packages/contracts/src/hermes-v2";

type Mutation = Extract<HermesV2ClientMessage, { op: "request.respond" | "request.lock" }>;
type RequestReply = Extract<HermesV2ServerMessage, { type: "result"; op: Mutation["op"] }>;
type NewRequest = HermesV2Request extends infer Request
  ? Request extends HermesV2Request ? Omit<Request, "key" | "epoch" | "sessionId" | "createdAt"> : never
  : never;
interface Gateway {
  readonly stories: Map<string, { snapshot: HermesV2Snapshot }>;
  emit(sessionId: string, type: HermesV2Event["type"], payload: unknown): void;
}
interface Observation {
  key: string;
  kind: HermesV2Response["kind"] | "lock";
  choice?: string;
  answers?: Record<string, string | null>;
  picked?: string | string[] | null;
  questionId?: string;
  answer?: string | null;
  secret?: { length: number; identifierLength: number | null; passwordLength: number | null; matched: boolean | null };
}

/** Nur synthetische Browserdaten, kein Transport oder Zugriff auf echtes Hermes. */
export class HermesV2BrowserRequests {
  readonly observations: Observation[] = [];
  hold = false;
  loseNextReply = false;
  keepOpenAfterReply = false;
  rejectNextAsStale = false;
  inspectSecret: ((value: string) => boolean) | null = null;
  private claims = new Set<string>();
  private pending: Array<() => void> = [];

  constructor(private readonly gateway: Gateway) {}

  open(sessionId: string, input: NewRequest): HermesV2Request {
    const snapshot = this.snapshot(sessionId);
    const request = hermesV2RequestSchema.parse({ ...input, sessionId,
      key: randomUUID(), epoch: snapshot.epoch, createdAt: Date.now() });
    snapshot.requests.push(request);
    this.gateway.emit(sessionId, "request.opened", request);
    return request;
  }

  cancel(sessionId: string, key: string, reason = "cancelled"): void {
    const snapshot = this.snapshot(sessionId);
    snapshot.requests = snapshot.requests.filter((request) => request.key !== key);
    this.claims.delete(key);
    this.gateway.emit(sessionId, "request.closed", { requestKey: key, reason });
  }

  finishPending(): void {
    const pending = this.pending.splice(0);
    for (const finish of pending) finish();
  }

  dispose(): void {
    this.pending = [];
    this.claims.clear();
    this.inspectSecret = null;
  }

  handle(message: Mutation, reply: (message: RequestReply) => void,
    fail: (code: "STALE_REQUEST" | "REQUEST_CLAIMED") => void, loseSocket: () => void): void {
    const snapshot = this.snapshot(message.sessionId);
    const request = snapshot.requests.find((request) => request.key === message.requestKey);
    if (this.rejectNextAsStale) {
      this.rejectNextAsStale = false;
      fail("STALE_REQUEST");
      return;
    }
    if (!request || request.epoch !== message.epoch) { fail("STALE_REQUEST"); return; }
    if (this.claims.has(request.key)) { fail("REQUEST_CLAIMED"); return; }
    this.claims.add(request.key);
    if (message.op === "request.lock") {
      if (request.kind !== "clarify" || !request.questions.some((question) => question.id === message.questionId)) {
        this.claims.delete(request.key); fail("STALE_REQUEST"); return;
      }
      this.observations.push({ key: request.key, kind: "lock", questionId: message.questionId, answer: message.answer });
    } else this.observe(request.key, message.response);
    if (this.loseNextReply) {
      this.loseNextReply = false;
      loseSocket();
      return;
    }
    const finish = () => {
      const current = snapshot.requests.find((item) => item.key === request.key);
      if (!current) { fail("STALE_REQUEST"); return; }
      if (message.op === "request.respond") {
        if (!this.keepOpenAfterReply) this.cancel(message.sessionId, request.key, "responded");
        reply({ v: 1, type: "result", id: message.id, op: message.op, data: { status: "sent" } });
        return;
      }
      if (current.kind !== "clarify") { fail("STALE_REQUEST"); return; }
      current.lockedAnswers[message.questionId] = message.answer;
      const remaining = current.questions.filter((question) => !Object.hasOwn(current.lockedAnswers, question.id)).map((question) => question.id);
      this.claims.delete(request.key);
      if (remaining.length === 0) this.cancel(message.sessionId, request.key, "responded");
      reply({ v: 1, type: "result", id: message.id, op: message.op, data: { remaining, settled: remaining.length === 0 } });
    };
    if (this.hold) this.pending.push(finish);
    else finish();
  }

  private observe(key: string, response: HermesV2Response): void {
    if (response.kind === "secret") {
      let identifierLength: number | null = null;
      let passwordLength: number | null = null;
      try {
        const parsed: unknown = JSON.parse(response.value);
        if (parsed && typeof parsed === "object") {
          const value = parsed as Record<string, unknown>;
          if (typeof value.identifier === "string") identifierLength = value.identifier.length;
          if (typeof value.password === "string") passwordLength = value.password.length;
        }
      } catch { /* Normale Secretwerte sind kein Login-JSON. */ }
      this.observations.push({ key, kind: response.kind, secret: { length: response.value.length,
        identifierLength, passwordLength, matched: this.inspectSecret?.(response.value) ?? null } });
      return;
    }
    if (response.kind === "approval") this.observations.push({ key, kind: response.kind, choice: response.choice });
    else if (response.kind === "clarify") this.observations.push({ key, kind: response.kind, answers: { ...response.answers } });
    else if (response.kind === "setup") this.observations.push({ key, kind: response.kind, picked: response.picked });
    else this.observations.push({ key, kind: response.kind });
  }

  private snapshot(sessionId: string): HermesV2Snapshot {
    const snapshot = this.gateway.stories.get(sessionId)?.snapshot;
    if (!snapshot) throw new Error("Unbekannte synthetische Anfragesitzung.");
    return snapshot;
  }
}
