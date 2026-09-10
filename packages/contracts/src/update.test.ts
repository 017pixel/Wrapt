import { describe, expect, it } from "vitest";
import { updateStatusResponseSchema, updateTriggerResponseSchema } from "./update.js";

describe("update-vertraege", () => {
  it("validiert den update-status", () => {
    const parsed = updateStatusResponseSchema.parse({
      branch: "master",
      version: "1.6.0",
      localHash: "abc123",
      localShort: "abc123",
      remoteHash: "def456",
      remoteShort: "def456",
      updateAvailable: true,
      dirty: false,
      dirtyFiles: [],
      dirtyCount: 0,
      checkedAt: new Date().toISOString(),
      message: "Update verfügbar.",
    });
    expect(parsed.updateAvailable).toBe(true);
  });

  it("setzt dirty-felder auf Standardwerte", () => {
    const parsed = updateStatusResponseSchema.parse({
      branch: "master",
      version: "1.6.0",
      localHash: "abc123",
      localShort: "abc123",
      remoteHash: "abc123",
      remoteShort: "abc123",
      updateAvailable: false,
      dirty: true,
      checkedAt: new Date().toISOString(),
      message: "Aktuell, aber es gibt lokale Änderungen.",
    });
    expect(parsed.dirtyFiles).toEqual([]);
    expect(parsed.dirtyCount).toBe(0);
  });

  it("validiert die update-antwort", () => {
    const parsed = updateTriggerResponseSchema.parse({
      status: "accepted",
      jobId: "00000000-0000-4000-8000-000000000001",
      target: "both",
      bootId: "boot-1",
      webBuildId: 123,
      logFile: "/tmp/update.log",
      fromHash: "abc",
      toHash: "def",
    });
    expect(parsed.target).toBe("both");
  });
});
