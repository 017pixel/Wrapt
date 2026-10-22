import { describe, expect, it, vi } from "vitest";
import { ChatAttachmentClient } from "./chat-attachment-client";

describe("Strikte begrenzte Attachmentantworten", () => {
  const uploadId = "12345678-1234-4234-8234-123456789abc", connection = "12345678-1234-4234-8234-123456789abd";
  const file = () => new File(["a"], "a.txt");
  const status = () => ({ uploadId, state: "ready", attachment: { id: "a".repeat(64), name: "a.txt", bytes: 1,
    mime: "text/plain", kind: "file-reference", expiresAt: Date.now() + 1000 } });
  const response = (value: unknown, code = 200) => new Response(JSON.stringify(value), { status: code });
  it.each(["foreign", "unknown-field", "ready-null", "receiving-file", "path", "json"])("verwirft %s nach möglichem POST als unknown", async (kind) => {
    const value = status(); let data: unknown = value;
    if (kind === "foreign") value.uploadId = crypto.randomUUID();
    if (kind === "unknown-field") data = { ...value, token: "unsicher" };
    if (kind === "ready-null") data = { ...value, attachment: null };
    if (kind === "receiving-file") data = { ...value, state: "receiving" };
    if (kind === "path") value.attachment.id = "/etc/passwd";
    const client = new ChatAttachmentClient(async () => kind === "json" ? new Response("kaputt") : response(data));
    await expect(client.upload(file(), "a", connection, uploadId, new AbortController().signal)).rejects.toMatchObject({ code: "UPLOAD_RESPONSE_INVALID", outcome: "unknown" });
  });
  it("begrenzt die tatsächliche Streammenge und cancelt ohne Gesamtkopie", async () => {
    const cancel = vi.fn(); let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(33_000)); }, cancel });
    const client = new ChatAttachmentClient(async () => new Response(body));
    await expect(client.upload(file(), "a", connection, uploadId, new AbortController().signal)).rejects.toMatchObject({ code: "UPLOAD_RESPONSE_INVALID", outcome: "unknown" });
    expect(cancel).toHaveBeenCalledOnce(); expect(pulled).toBeLessThanOrEqual(4);
  });
  it("HTTPfehler übernimmt keinen freien Servertext und nur korrelierte outcomes", async () => {
    const client = new ChatAttachmentClient(async () => response({ uploadId, code: "REJECTED", message: "server-secret", outcome: "not_sent" }, 409));
    await expect(client.upload(file(), "a", connection, uploadId, new AbortController().signal)).rejects.toMatchObject({ outcome: "not_sent", message: expect.not.stringContaining("server-secret") });
    const foreign = new ChatAttachmentClient(async () => response({ uploadId: crypto.randomUUID(), code: "REJECTED", message: "secret", outcome: "not_sent" }, 409));
    await expect(foreign.upload(file(), "a", connection, uploadId, new AbortController().signal)).rejects.toMatchObject({ outcome: "unknown" });
  });
  it("vorheriger Abort sendet nichts, Abort nach möglichem Send bleibt unknown", async () => {
    const abort = new AbortController(), fetcher = vi.fn<typeof fetch>(); abort.abort();
    const client = new ChatAttachmentClient(fetcher);
    await expect(client.upload(file(), "a", connection, uploadId, abort.signal)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(fetcher).not.toHaveBeenCalled();
    const current = new AbortController(); fetcher.mockImplementation(async () => { current.abort(); return response(status()); });
    await expect(client.upload(file(), "a", connection, uploadId, current.signal)).rejects.toMatchObject({ outcome: "unknown" });
  });
  it("Statusklärung ist allein GET und hat keine Dateipayload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(status()));
    const client = new ChatAttachmentClient(fetcher); await client.status(connection, uploadId, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledWith(`/api/v1/hermes/v2/attachments/uploads/${uploadId}`, expect.objectContaining({ method: "GET", credentials: "same-origin" }));
    expect(fetcher.mock.calls[0]![1]).not.toHaveProperty("body");
  });
});
