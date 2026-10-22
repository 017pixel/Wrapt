import { ResourceFailure, staleResource } from "./resource-error";
import { resourcePolicy } from "./resource-policy";

interface WaitingRead {
  start: () => void;
  cancel: () => void;
}
/** Kleine flüchtige Warteschlange, keine Cache-/Pollingengine. */
export class ResourceReadQueue {
  private running = 0;
  private waiting: WaitingRead[] = [];
  run<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(staleResource());
    if (this.waiting.length >= resourcePolicy.queuedReads) return Promise.reject(new ResourceFailure("CLIENT_BUSY", "Zu viele Ressourcenreads sind offen."));
    return new Promise<T>((resolve, reject) => {
      let started = false;
      const entry: WaitingRead = {
        cancel: () => { this.waiting = this.waiting.filter((item) => item !== entry); reject(staleResource()); },
        start: () => {
          if (signal.aborted) { entry.cancel(); return; }
          started = true;
          signal.removeEventListener("abort", abort);
          this.running++;
          void Promise.resolve().then(action).then(resolve, reject).finally(() => { this.running--; this.drain(); });
        },
      };
      const abort = () => { if (!started) entry.cancel(); };
      signal.addEventListener("abort", abort, { once: true });
      this.waiting.push(entry);
      this.drain();
    });
  }
  private drain(): void {
    while (this.running < resourcePolicy.concurrentReads && this.waiting.length) this.waiting.shift()!.start();
  }
}
