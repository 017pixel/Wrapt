import { Worker } from "node:worker_threads";
import type { verifyAuditDatabase } from "./audit-verification.mjs";

export type AuditVerification = ReturnType<typeof verifyAuditDatabase>;

/** Ein gebundener Readonly-Worker, ein gemeinsamer laufender Prüfsnapshot. */
export class AuditVerifier {
  private worker: Worker | null = null;
  private pending: Promise<AuditVerification> | null = null;
  private settle: { resolve(value: AuditVerification): void; reject(error: Error): void } | null = null;
  private closed = false;

  constructor(private readonly path: string) {}

  verify(): Promise<AuditVerification> {
    if (this.closed) return Promise.reject(new Error("Auditprüfung ist geschlossen."));
    if (this.pending) return this.pending;
    if (!this.worker) {
      const worker = new Worker(new URL("./audit-verification.mjs", import.meta.url), { workerData: { path: this.path } });
      worker.unref();
      worker.on("message", (message: { result?: AuditVerification; error?: string }) => {
        const settle = this.settle;
        this.settle = null;
        this.pending = null;
        worker.unref();
        if (message.result) settle?.resolve(message.result);
        else settle?.reject(new Error(message.error ?? "Auditworker lieferte kein Ergebnis."));
      });
      const fail = (error: Error) => {
        if (this.worker !== worker) return;
        this.worker = null;
        this.settle?.reject(error);
        this.settle = null;
        this.pending = null;
      };
      worker.on("error", fail);
      worker.on("exit", (code) => fail(new Error(`Auditworker beendet (${code}).`)));
      this.worker = worker;
    }
    this.pending = new Promise((resolve, reject) => { this.settle = { resolve, reject }; });
    this.worker.ref();
    this.worker.postMessage(null);
    return this.pending;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.settle?.reject(new Error("Auditprüfung beim Shutdown abgebrochen."));
    this.settle = null;
    this.pending = null;
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}
