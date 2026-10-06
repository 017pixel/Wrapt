import { expect, it, vi } from "vitest";
import { queuePreviewSessionRequest } from "./previewSessionRequests.js";

it("wartet beim Schließen auf eine verzögerte Öffnung und erlaubt späteres Wiederöffnen", async () => {
  let resolve!: () => void;
  const opening = queuePreviewSessionRequest("runtime:delay", () => new Promise<void>((done) => { resolve = done; }));
  const close = vi.fn(async () => undefined);
  const closing = queuePreviewSessionRequest("runtime:delay", close);
  expect(close).not.toHaveBeenCalled();
  resolve();
  await Promise.all([opening, closing]);
  expect(close).toHaveBeenCalledOnce();
  await expect(queuePreviewSessionRequest("runtime:delay", async () => "offen")).resolves.toBe("offen");
});

it("gibt nach einem Öffnungsfehler trotzdem frei und blockiert andere Sessions nicht", async () => {
  const opening = queuePreviewSessionRequest("runtime:failed", async () => { throw new Error("Netzwerk"); });
  const closing = queuePreviewSessionRequest("runtime:failed", async () => "frei");
  await expect(queuePreviewSessionRequest("runtime:other", async () => "unabhängig")).resolves.toBe("unabhängig");
  await expect(opening).rejects.toThrow("Netzwerk");
  await expect(closing).resolves.toBe("frei");
});
