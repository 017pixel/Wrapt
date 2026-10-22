import { hermesV2AttachmentErrorSchema, hermesV2UploadStatusSchema, type HermesV2UploadStatus } from "@wrapt/contracts/hermes-v2";
import { ChatError } from "./gateway-protocol";
import { chatPolicy } from "./chat-policy";

export class ChatAttachmentClient {
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  upload(file: File, sessionId: string, connectionId: string, uploadId: string, signal: AbortSignal): Promise<HermesV2UploadStatus> {
    const body = new FormData(); body.append("file", file);
    return this.request(`?sessionId=${encodeURIComponent(sessionId)}`, connectionId, uploadId, signal, body);
  }
  status(connectionId: string, uploadId: string, signal: AbortSignal): Promise<HermesV2UploadStatus> {
    return this.request(`/uploads/${encodeURIComponent(uploadId)}`, connectionId, uploadId, signal);
  }
  private async request(path: string, connectionId: string, uploadId: string, signal: AbortSignal, body?: FormData): Promise<HermesV2UploadStatus> {
    if (signal.aborted) throw new ChatError("UPLOAD_ABORTED", "Der Dateivorgang wurde abgebrochen.");
    let response: Response;
    try {
      response = await this.fetcher(`/api/v1/hermes/v2/attachments${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", signal,
        headers: { "X-Hermes-V2-Connection-Id": connectionId, "X-Hermes-V2-Upload-Id": uploadId }, ...(body ? { body } : {}) });
      const reader = response.body?.getReader();
      let bytes = 0;
      const parts: Uint8Array[] = [];
      if (reader) {
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > chatPolicy.attachmentResponseBytes || signal.aborted) {
              await reader.cancel(); throw new ChatError("UPLOAD_RESPONSE_INVALID", "Die Dateiantwort wurde verworfen.", body ? "unknown" : "not_sent");
            }
            parts.push(next.value);
          }
        } finally { reader.releaseLock(); }
      }
      if (signal.aborted) throw new ChatError("UPLOAD_ABORTED", "Der Dateivorgang wurde abgebrochen.", body ? "unknown" : "not_sent");
      const buffer = new Uint8Array(bytes); let offset = 0;
      for (const part of parts) { buffer.set(part, offset); offset += part.byteLength; }
      let value: unknown;
      try { value = JSON.parse(new TextDecoder().decode(buffer)); }
      catch { throw new ChatError("UPLOAD_RESPONSE_INVALID", "Die Dateiantwort ist nicht kompatibel.", body ? "unknown" : "not_sent"); }
      if (!response.ok) {
        const failure = hermesV2AttachmentErrorSchema.safeParse(value);
        throw new ChatError("ATTACHMENT_FAILED", "Die Datei konnte nicht sicher angehängt werden. Bitte den Status prüfen.", failure.success && (!failure.data.uploadId || failure.data.uploadId === uploadId) ? failure.data.outcome : body ? "unknown" : "not_sent");
      }
      const parsed = hermesV2UploadStatusSchema.safeParse(value);
      if (!parsed.success || parsed.data.uploadId !== uploadId || (parsed.data.state === "ready") !== (parsed.data.attachment !== null)) {
        throw new ChatError("UPLOAD_RESPONSE_INVALID", "Die Dateiantwort gehört nicht zu diesem Upload.", body ? "unknown" : "not_sent");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError("UPLOAD_UNKNOWN", "Der Dateiausgang ist unklar. Bitte denselben Uploadstatus prüfen.", body ? "unknown" : "not_sent");
    }
  }
}
