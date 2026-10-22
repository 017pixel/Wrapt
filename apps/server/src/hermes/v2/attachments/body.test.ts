import { Readable } from "node:stream";
import type { FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readUpload } from "./body.js";
import { attachmentPolicy } from "./policy.js";

describe("begrenzter Multipartstream", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("bricht einen endlos langsamen Body bei der zentralen Deadline ab und zerstört den Stream", async () => {
    vi.useFakeTimers(); const file = new Readable({ read() {} });
    const request = { parts: async function* () { yield { type: "file", fieldname: "file", filename: "x", mimetype: "text/plain", file }; } } as unknown as FastifyRequest;
    const controller = new AbortController(); const reserve = vi.fn();
    const promise = readUpload(request, controller.signal, reserve);
    const rejected = expect(promise).rejects.toMatchObject({ code: "STALE_REQUEST", outcome: "not_sent" });
    setTimeout(() => controller.abort(), attachmentPolicy.bodyMs);
    await vi.advanceTimersByTimeAsync(attachmentPolicy.bodyMs); await rejected;
    expect(file.destroyed).toBe(true); expect(reserve).toHaveBeenCalledTimes(1);
  });
  it("bereits abgebrochene Bodies reservieren nichts und lesen keine Datei", async () => {
    const file = Readable.from([Buffer.from("x")]);
    const request = { parts: async function* () { yield { type: "file", fieldname: "file", filename: "x", mimetype: "text/plain", file }; } } as unknown as FastifyRequest;
    const controller = new AbortController(); controller.abort(); const reserve = vi.fn();
    await expect(readUpload(request, controller.signal, reserve)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(reserve).not.toHaveBeenCalled();
  });
});
