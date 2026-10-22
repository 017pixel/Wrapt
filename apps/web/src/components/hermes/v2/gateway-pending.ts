import { ChatError, isMutation, type GatewayOperation, type GatewayResult } from "./gateway-protocol";
import { chatPolicy } from "./chat-policy";

interface Pending {
  op: GatewayOperation["op"];
  resolve: (result: GatewayResult) => void;
  reject: (error: ChatError) => void;
  timer: ReturnType<typeof setTimeout>;
}
/** Enthält keine Request-Payloads oder Secret-Antworten. */
export class GatewayPending {
  private entries = new Map<string, Pending>();
  constructor(private readonly onSettled: () => void) {}
  get size(): number { return this.entries.size; }
  get mutations(): number {
    return [...this.entries.values()].filter((entry) => isMutation(entry.op)).length;
  }
  add(id: string, op: Pending["op"], resolve: Pending["resolve"], reject: Pending["reject"]): void {
    const timer = setTimeout(() => this.reject(id, new ChatError(
      "RPC_TIMEOUT", "Die Antwort von Hermes ist ausgeblieben.", isMutation(op) ? "unknown" : "not_sent",
    )), chatPolicy.rpcTimeoutMs);
    this.entries.set(id, { op, resolve, reject, timer });
  }
  result(result: GatewayResult): boolean {
    const entry = this.entries.get(result.id);
    if (!entry) return true;
    if (entry.op !== result.op) return false;
    this.remove(result.id)?.resolve(result);
    this.onSettled();
    return true;
  }
  reject(id: string, error: ChatError): void {
    this.remove(id)?.reject(error);
    this.onSettled();
  }
  failAll(code: string, message: string): void {
    for (const [id, entry] of this.entries) {
      this.remove(id)?.reject(new ChatError(code, message, isMutation(entry.op) ? "unknown" : "not_sent"));
    }
  }
  private remove(id: string): Pending | undefined {
    const entry = this.entries.get(id);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(id);
    return entry;
  }
}
