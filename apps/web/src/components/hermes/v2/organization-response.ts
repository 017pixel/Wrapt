import { ChatError } from "./gateway-protocol";
import { organizationPolicy } from "./organization-policy";

/** Begrenzung vor dem Puffern; auch Antworten ohne Content-Length bleiben beschränkt. */
export async function readOrganizationResponse(response: Response, controller: AbortController, mutation: boolean): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ChatError("PROTOCOL_MISMATCH", "Die Organisationsantwort ist leer.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  controller.signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      const next = await reader.read();
      if (controller.signal.aborted) throw new Error("aborted");
      if (next.done) break;
      length += next.value.byteLength;
      if (length > organizationPolicy.maxResponseBytes) {
        void reader.cancel().catch(() => {});
        controller.abort();
        throw new ChatError("PROTOCOL_MISMATCH", "Die Organisationsantwort ist zu groß.", mutation ? "unknown" : "not_sent");
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
    catch { throw new ChatError("PROTOCOL_MISMATCH", "Die Organisationsantwort ist nicht kompatibel.", mutation ? "unknown" : "not_sent"); }
  } finally { controller.signal.removeEventListener("abort", abort); reader.releaseLock(); }
}
