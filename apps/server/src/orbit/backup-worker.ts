import { Worker } from "node:worker_threads";

export interface PendingOrbitBackup { revision: number; updatedAt: string; documentJson: string }
export interface OrbitBackupWriter {
  write(item: PendingOrbitBackup): Promise<void>;
  prune(minimumRevision: number, pending: number[]): Promise<void>;
  close(): Promise<void>;
}

/** Ein Writer verarbeitet ausschließlich die vom geordneten Drain übergebenen Jobs. */
export class OrbitBackupWorker implements OrbitBackupWriter {
  private worker: Worker | null = null;
  private pending: { resolve(): void; reject(error: Error): void } | null = null;
  constructor(private readonly directory: string) {}

  private run(message: object): Promise<void> {
    if (this.pending) return Promise.reject(new Error("Orbit-Backupwriter ist bereits beschäftigt."));
    if (!this.worker) {
      const worker = new Worker(new URL("./backup-writer.mjs", import.meta.url), { workerData: { directory: this.directory } });
      worker.unref();
      worker.on("message", (reply: { ok?: boolean; error?: string }) => {
        const pending = this.pending;
        this.pending = null;
        worker.unref();
        if (reply.ok) pending?.resolve();
        else pending?.reject(new Error(reply.error ?? "Backupworker lieferte kein Ergebnis."));
      });
      const fail = (error: Error) => {
        if (this.worker !== worker) return;
        this.worker = null;
        this.pending?.reject(error);
        this.pending = null;
      };
      worker.on("error", fail);
      worker.on("exit", (code) => fail(new Error(`Backupworker beendet (${code}).`)));
      this.worker = worker;
    }
    const promise = new Promise<void>((resolve, reject) => { this.pending = { resolve, reject }; });
    this.worker.ref();
    this.worker.postMessage(message);
    return promise;
  }
  write(item: PendingOrbitBackup) { return this.run({ type: "write", item }); }
  prune(minimumRevision: number, pending: number[]) { return this.run({ type: "prune", minimumRevision, pending }); }
  async close(): Promise<void> {
    this.pending?.reject(new Error("Backup beim Shutdown abgebrochen; Outbox bleibt erhalten."));
    this.pending = null;
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}
