import { ResourceFailure, staleResource } from "./resource-error";
import { resourcePolicy } from "./resource-policy";

export async function awaitResource<T>(promise: Promise<T>, signal: AbortSignal, mutation: boolean): Promise<T> {
  if (signal.aborted) throw staleResource(mutation ? "unknown" : "not_sent");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(staleResource(mutation ? "unknown" : "not_sent")); });
  signal.addEventListener("abort", abort, { once: true });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

/** Auch ein nie antwortender Bodyreader endet beim Abort, unabhängig vom Fetchmock. */
export async function readResourceResponse(response: Response, signal: AbortSignal, mutation: boolean): Promise<unknown> {
  const outcome = mutation ? "unknown" : "not_sent";
  const invalid = () => new ResourceFailure("PROTOCOL_MISMATCH", "Die Ressourcenantwort ist nicht kompatibel.", outcome);
  if (signal.aborted) throw staleResource(outcome);
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { rejectAbort(staleResource(outcome)); void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (signal.aborted) abort();
    for (;;) {
      const next = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw staleResource(outcome);
      if (next.done) break;
      length += next.value.byteLength;
      if (length > resourcePolicy.maxResponseBytes) {
        void reader.cancel().catch(() => {});
        throw invalid();
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
    catch { throw invalid(); }
  } finally {
    signal.removeEventListener("abort", abort);
    try { reader.releaseLock(); } catch { /* Der abgebrochene Reader kann noch auslaufen. */ }
  }
}
