import { describe, expect, it } from "vitest";
import { getUpdateStatus } from "./update.js";

describe("update-status", () => {
  it("liefert branch, hashes und pruefzeitpunkt", async () => {
    const status = await getUpdateStatus();
    expect(status.branch.length).toBeGreaterThan(0);
    expect(status.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(status.checkedAt.length).toBeGreaterThan(0);
    expect(typeof status.dirty).toBe("boolean");
    expect(typeof status.updateAvailable).toBe("boolean");
    expect(status.message.length).toBeGreaterThan(0);
    expect(Array.isArray(status.dirtyFiles)).toBe(true);
    expect(status.dirtyCount).toBeGreaterThanOrEqual(status.dirtyFiles.length);
    if (status.dirty) expect(status.dirtyCount).toBeGreaterThan(0);
  }, 20_000);
});
