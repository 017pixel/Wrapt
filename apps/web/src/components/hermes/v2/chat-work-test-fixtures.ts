import type { HermesV2WorkRoster, HermesV2WorkSubagent, HermesV2WorkProcess, HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, settle, snapshot, type TestSocket } from "./chat-test-fixtures";
import { useAppPreferences } from "../../../stores/appPreferences";

export const workOwner = (sessionId: string | null = "a", ownerId = "owner") => ({ ownerId, sessionId, active: true, visible: true, onSelectSession: () => {} });
export const workChild = (id = "child", patch: Partial<HermesV2WorkSubagent> = {}): HermesV2WorkSubagent => ({ kind: "subagent", id,
  parentId: null, depth: 0, delegationId: null, goal: "Echte Aufgabe", model: "test:model", startedAt: 10, status: "running",
  toolCount: 0, lastTool: null, acceptingSteer: true, durationMs: null, ...patch });
export const workProcess = (id = "proc", patch: Partial<HermesV2WorkProcess> = {}): HermesV2WorkProcess => ({ kind: "process", id,
  command: "eigener Befehl", status: "running", startedAt: 20, uptimeSeconds: 0, output: "", exitCode: null, ...patch });
export const workRoster = (patch: Partial<HermesV2WorkRoster> = {}): HermesV2WorkRoster => ({ revision: 0, subagents: [workChild()],
  delegations: [], processes: [workProcess()], tasks: [], queuedText: null, coverage: { subagents: "live-and-observed", delegations: "recent-failures-partial",
    processes: "session", tasks: "observed-partial", queue: "next-only", truncated: false }, ...patch });
export async function workFixture() {
  useAppPreferences.setState({ hermesV2Enabled: true });
  const gateway = new TestGateway();
  gateway.composer = true;
  gateway.snapshots.set("a", snapshot("a"));
  const runtime = new ChatRuntime(gateway.createClient());
  let roster = workRoster();
  let handler: ((frame: HermesV2ClientMessage, socket: TestSocket) => boolean) | null = null;
  gateway.handle = (frame, socket) => {
    if (handler?.(frame, socket)) return true;
    if (frame.op === "work.read") { queueMicrotask(() => socket.result(frame, roster)); return true; }
    if (frame.op === "work.subagent.interrupt") { queueMicrotask(() => socket.result(frame, { id: frame.subagentId, found: true })); return true; }
    if (frame.op === "work.subagent.tail") { queueMicrotask(() => socket.result(frame, { id: frame.subagentId, available: true, text: "Ausgabe", truncated: false })); return true; }
    if (frame.op === "work.process.kill") { queueMicrotask(() => socket.result(frame, { id: frame.processId, status: "killed", exitCode: null, output: "", error: null })); return true; }
    if (frame.op === "work.background" || frame.op === "work.btw") { queueMicrotask(() => socket.result(frame, { kind: frame.op === "work.btw" ? "btw" : "background", taskId: "task" })); return true; }
    if (frame.op === "session.steer") { queueMicrotask(() => socket.result(frame, { status: "queued" })); return true; }
    return false;
  };
  const release = runtime.acquire(workOwner());
  await settle();
  const actions = runtime.actionsFor("owner");
  await actions.refreshWork();
  return { gateway, runtime, actions, release, setRoster(value: HermesV2WorkRoster) { roster = value; },
    setHandler(value: typeof handler) { handler = value; }, view: () => runtime.owners.getView("owner").work,
    cleanup() { runtime.dispose("v2-navigation"); useAppPreferences.setState({ hermesV2Enabled: false }); } };
}
export type WorkFixture = Awaited<ReturnType<typeof workFixture>>;
