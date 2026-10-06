import { expect, it, vi } from "vitest";
import { closeTransientPreviewSession } from "./previewSessionCleanup";
import { apiClient } from "../../lib/apiClient";

vi.mock("../../lib/apiClient", () => ({ apiClient: { closePreviewSessionByKey: vi.fn(async () => undefined) } }));
it("schließt eine beim Unmount noch laufende Slotöffnung erst nach deren Antwort", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  const cleanup = closeTransientPreviewSession("preview:temporary", pending);
  expect(apiClient.closePreviewSessionByKey).not.toHaveBeenCalled();
  resolve();
  await cleanup;
  expect(apiClient.closePreviewSessionByKey).toHaveBeenCalledWith("preview:temporary");
});
