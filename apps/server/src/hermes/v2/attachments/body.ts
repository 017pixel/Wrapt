import type { FastifyRequest } from "fastify";
import { GatewayError } from "../errors.js";
import { attachmentPolicy as p } from "./policy.js";

export async function readUpload(request: FastifyRequest, signal: AbortSignal,
  reserve: (filename: string, mime: string) => void): Promise<Buffer> {
  let stream: { destroy(error?: Error): void } | null = null;
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => {
    const error = new GatewayError("STALE_REQUEST", "Der Upload wurde abgebrochen oder hat zu lange gedauert.");
    stream?.destroy(error); rejectAbort(error);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const collect = async () => {
    let received = false;
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const part of request.parts()) {
      if (signal.aborted) throw new GatewayError("STALE_REQUEST", "Der Upload wurde abgebrochen.");
      if (part.type !== "file" || part.fieldname !== "file" || received) throw new GatewayError("INVALID_MESSAGE", "Genau eine Datei ohne weitere Formfelder ist erforderlich.");
      received = true; stream = part.file;
      reserve(part.filename, part.mimetype);
      for await (const chunk of part.file) {
        if (signal.aborted) throw new GatewayError("STALE_REQUEST", "Der Upload wurde abgebrochen.");
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        bytes += buffer.length;
        if (bytes > p.fileBytes) throw new GatewayError("PAYLOAD_TOO_LARGE", "Die Datei ist größer als 4 MiB.");
        chunks.push(buffer);
      }
      if (part.file.truncated) throw new GatewayError("PAYLOAD_TOO_LARGE", "Die Datei ist größer als 4 MiB.");
    }
    if (!received || !bytes) throw new GatewayError("INVALID_MESSAGE", "Die Datei fehlt oder ist leer.");
    return Buffer.concat(chunks, bytes);
  };
  try { return await Promise.race([collect(), aborted]); }
  finally { signal.removeEventListener("abort", abort); }
}
