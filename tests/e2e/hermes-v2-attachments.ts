import { randomBytes } from "node:crypto";
import type { BrowserContext, Route } from "@playwright/test";
import {
  hermesV2AttachmentSchema, hermesV2UploadStatusSchema, hermesV2AttachmentErrorSchema, type HermesV2Attachment,
  type HermesV2UploadStatus,
} from "../../packages/contracts/src/hermes-v2";

interface Gateway { readonly viewers: Set<{ id: string; sessions: Set<string>; composer: boolean }> }
interface StoredFile { sessionId: string; attachment: HermesV2Attachment; bytes: Buffer }

/** Isolierter HTTP-Browserfixture; ausschließlich ausdrücklich erzeugte Dummydateien. */
export class HermesV2BrowserAttachments {
  readonly calls: Array<{ kind: "upload" | "status" | "download"; uploadId?: string; id?: string; sessionId?: string }> = [];
  readonly uploads = new Map<string, HermesV2UploadStatus>();
  readonly files = new Map<string, StoredFile>();
  readonly submissions: Array<{ sessionId: string; ids: string[]; wireBytes: number }> = [];
  holdUploads = false;
  loseNextReply = false;
  unknownNextUpload = false;
  rejectNextUpload = false;
  private pending: Array<() => Promise<void>> = [];

  constructor(private readonly gateway: Gateway) {}

  async install(context: BrowserContext): Promise<void> {
    await context.route("**/api/v1/hermes/v2/attachments**", (route) => this.route(route));
  }
  async finishPending(): Promise<void> { for (const callback of this.pending.splice(0)) await callback(); }
  dispose(): void { this.pending = []; this.uploads.clear(); this.files.clear(); }

  forSubmit(sessionId: string, ids: readonly string[] = []): HermesV2Attachment[] | null {
    const files = ids.map((id) => this.files.get(id));
    if (ids.length > 10 || new Set(ids).size !== ids.length
      || files.some((file) => !file || file.sessionId !== sessionId || file.attachment.expiresAt <= Date.now())) return null;
    return files.map((file) => file!.attachment);
  }

  private async route(route: Route): Promise<void> {
    const request = route.request(), url = new URL(request.url());
    const statusId = url.pathname.match(/\/attachments\/uploads\/([^/]+)$/)?.[1];
    if (request.method() === "GET" && statusId) {
      this.calls.push({ kind: "status", uploadId: statusId });
      const status = this.uploads.get(statusId);
      if (!status) { await this.fail(route, "UPLOAD_NOT_FOUND", 404, "not_sent", statusId); return; }
      await this.status(route, status);
      return;
    }
    const fileId = url.pathname.match(/\/attachments\/([a-f0-9]{64})$/)?.[1];
    if (request.method() === "GET" && fileId) {
      this.calls.push({ kind: "download", id: fileId });
      const file = this.files.get(fileId);
      if (!file) { await this.fail(route, "FILE_NOT_FOUND", 404); return; }
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: file.bytes,
        headers: { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.attachment.name)}`,
          "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
      return;
    }
    if (request.method() !== "POST") { await this.fail(route, "INVALID_UPLOAD", 400); return; }
    const headers = request.headers();
    const uploadId = headers["x-hermes-v2-upload-id"] ?? "";
    const connectionId = headers["x-hermes-v2-connection-id"] ?? "";
    const sessionId = url.searchParams.get("sessionId") ?? "";
    this.calls.push({ kind: "upload", uploadId, sessionId });
    const viewer = [...this.gateway.viewers].find((entry) => entry.id === connectionId);
    if (!/^[a-f0-9-]{36}$/i.test(uploadId) || !viewer?.composer || !viewer.sessions.has(sessionId)) {
      await this.fail(route, "FORBIDDEN", 403); return;
    }
    const previous = this.uploads.get(uploadId);
    if (previous) { await this.status(route, previous); return; }
    if (this.rejectNextUpload) {
      this.rejectNextUpload = false;
      this.uploads.set(uploadId, { uploadId, state: "not_sent", attachment: null });
      await this.fail(route, "UPLOAD_NOT_SENT", 429, "not_sent", uploadId); return;
    }
    const part = this.filePart(request.postDataBuffer(), headers["content-type"] ?? "");
    if (!part || part.bytes.length === 0 || part.bytes.length > 4_194_304) {
      await this.fail(route, "PAYLOAD_TOO_LARGE", 413, "not_sent", uploadId); return;
    }
    this.uploads.set(uploadId, { uploadId, state: "receiving", attachment: null });
    const finish = async () => {
      if (this.unknownNextUpload) {
        this.unknownNextUpload = false;
        this.uploads.set(uploadId, { uploadId, state: "unknown", attachment: null });
        await this.fail(route, "UPLOAD_UNKNOWN", 503, "unknown", uploadId); return;
      }
      const id = randomBytes(32).toString("hex");
      const attachment = hermesV2AttachmentSchema.parse({ id, name: part.name, bytes: part.bytes.length,
        mime: part.mime, kind: "file-reference", expiresAt: Date.now() + 86_400_000 });
      this.files.set(id, { sessionId, attachment, bytes: part.bytes });
      const status = { uploadId, state: "ready" as const, attachment };
      this.uploads.set(uploadId, status);
      if (this.loseNextReply) { this.loseNextReply = false; await route.abort("connectionreset"); return; }
      try { await this.status(route, status); }
      catch { /* Der Browser darf den eigenen Upload beim Kontextwechsel abbrechen. */ }
    };
    if (this.holdUploads) this.pending.push(finish); else await finish();
  }

  private filePart(body: Buffer | null, contentType: string): { name: string; mime: string; bytes: Buffer } | null {
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
    if (!body || !boundary) return null;
    const split = body.indexOf("\r\n\r\n");
    const end = body.lastIndexOf(`\r\n--${boundary}`);
    if (split < 0 || end < split + 4) return null;
    const head = body.subarray(0, split).toString("utf8");
    const name = head.match(/filename="([^"]+)"/)?.[1];
    if (!name || !/name="file"/.test(head)) return null;
    return { name: name.slice(0, 200), mime: head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.slice(0, 100) ?? "application/octet-stream",
      bytes: body.subarray(split + 4, end) };
  }
  private status(route: Route, status: HermesV2UploadStatus): Promise<void> {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hermesV2UploadStatusSchema.parse(status)) });
  }
  private fail(route: Route, code: string, status: number, outcome: "not_sent" | "unknown" = "not_sent", uploadId?: string): Promise<void> {
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(hermesV2AttachmentErrorSchema.parse({ code,
      message: "Der synthetische Upload konnte nicht abgeschlossen werden.", outcome, ...(uploadId ? { uploadId } : {}) })) });
  }
}
