import type { HermesV2ClientMessage, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { awaitContextFixture } from "../attachments/await-context.fixture.js";

export type WorkInput = { [K in HermesV2ClientMessage["op"]]: Omit<Extract<HermesV2ClientMessage, { op: K }>, "id"|"v"> }[HermesV2ClientMessage["op"]];
export function resultData(frame: HermesV2ServerMessage) {
  if (frame.type !== "result" || frame.op !== "work.read") throw new Error(`Kein Workroster: ${JSON.stringify(frame)}`);
  return frame.data;
}
export async function workFixture() {
  const f = await awaitContextFixture();
  f.client.manager.connections.get(f.client.id)!.work = true;
  const children: unknown[] = []; const delegations: unknown[] = []; const processes: unknown[] = [];
  let queued: string | null = null;
  let interrupt = false; let available = false; let tail = ""; let truncated = false;
  let killed: Record<string, unknown> = { status: "killed", exit_code: 0, output: "Beendet" };
  let nextTask = "nebenaufgabe";
  const hook = f.core.resultHook!;
  f.core.resultHook = (method, params, raw) => {
    const result = hook(method, params, raw);
    if (method === "session.activate") return { ...result as object, queued: queued === null ? null : { user: queued } };
    if (method === "subagent.list") return { subagents: children, delegations };
    if (method === "process.list") return { processes };
    if (method === "subagent.interrupt") return { subagent_id: params.subagent_id, found: interrupt };
    if (method === "subagent.tail") return { subagent_id: params.subagent_id, available, text: tail, truncated };
    if (method === "process.kill") return killed;
    if (method === "prompt.background" || method === "prompt.btw") return { task_id: nextTask };
    return result;
  };
  const run = (input: Omit<Extract<WorkInput, { op: "work.read" }>, "sessionId"> = { op: "work.read" }) =>
    f.client.run({ ...input, sessionId: f.session.id });
  const read = async () => resultData(await run());
  return { ...f, children, delegations, processes, read, run,
    queue: (value: string | null) => { queued = value; },
    interrupt: (value: boolean) => { interrupt = value; },
    tail: (value: string, usable = true, cut = false) => { tail = value; available = usable; truncated = cut; },
    kill: (value: Record<string, unknown>) => { killed = value; }, task: (value: string) => { nextTask = value; },
    event: (type: string, payload: Record<string, unknown>) => f.core.event(f.session, type, payload) };
}
