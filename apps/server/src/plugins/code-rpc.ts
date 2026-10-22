import { randomUUID } from "node:crypto";
import type { PluginWireMessage, PluginWireResult } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
}

function wireMessage(value: unknown): value is PluginWireMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id.length <= 100
    && (record.kind === "result" || (record.kind === "call" && typeof record.method === "string"));
}

/** Symmetrische IPC-Aufrufe; niemals Funktionen oder offene Host-Handles übertragen. */
export class PluginRpcPeer {
  private readonly pending = new Map<string, PendingCall>();
  private closed = false;

  constructor(
    private readonly send: (message: PluginWireMessage) => void,
    private readonly handler: (method: string, input: unknown) => Promise<unknown> | unknown,
    private timeoutMs: number,
  ) {}

  setTimeoutMs(value: number): void { this.timeoutMs = value; }

  call<T = unknown>(method: string, input?: unknown, timeoutMs = this.timeoutMs): Promise<T> {
    if (this.closed) return Promise.reject(new AppError(503, "runtime-unavailable", "Die Plugin-Laufzeit ist nicht erreichbar."));
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new AppError(504, "runtime-timeout", `Der Plugin-Aufruf ${method} hat sein Zeitlimit überschritten.`));
      }, timeoutMs);
      timeout.unref();
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timeout });
      try { this.send({ kind: "call", id, method, input }); }
      catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("IPC-Aufruf fehlgeschlagen"));
      }
    });
  }

  receive(value: unknown): void {
    if (this.closed || !wireMessage(value)) return;
    if (value.kind === "result") {
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      clearTimeout(pending.timeout);
      if (value.error) pending.reject(new AppError(502, value.error.code, value.error.message));
      else pending.resolve(value.value);
      return;
    }
    void Promise.resolve().then(() => this.handler(value.method, value.input)).then(
      (result) => this.respond({ kind: "result", id: value.id, value: result }),
      (error: unknown) => this.respond({ kind: "result", id: value.id, error: {
        code: error instanceof AppError ? error.code : "plugin-error",
        message: error instanceof Error ? error.message : "Die Plugin-Aktion ist fehlgeschlagen.",
      } }),
    );
  }

  close(reason = "Die Plugin-Laufzeit wurde beendet."): void {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new AppError(503, "runtime-unavailable", reason));
    }
    this.pending.clear();
  }

  private respond(result: PluginWireResult): void {
    if (this.closed) return;
    try { this.send(result); }
    catch { this.close("Die Plugin-Antwort konnte nicht übertragen werden."); }
  }
}
