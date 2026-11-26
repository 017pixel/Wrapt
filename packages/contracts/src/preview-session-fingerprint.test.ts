import { describe, expect, it } from "vitest";
import { previewRequestFingerprintFields } from "./preview-sessions.js";

describe("Preview-Idempotenz-Fingerprint", () => {
  const base = {
    sessionKey: "preview:demo",
    projectId: "demo",
    primaryPort: 5173,
    primaryProtocol: "http" as const,
    isolate: true,
    storageProfileId: null,
  };

  it("ändert sich mit dem angefragten Slot", () => {
    expect(previewRequestFingerprintFields({ ...base, requestedSlotId: 3 }))
      .not.toEqual(previewRequestFingerprintFields({ ...base, requestedSlotId: 4 }));
    expect(previewRequestFingerprintFields({ ...base, requestedSlotId: null }))
      .toEqual(previewRequestFingerprintFields(base));
  });

  it("behandelt dieselbe Anfrage als identisch", () => {
    expect(previewRequestFingerprintFields({ ...base, requestedSlotId: 3 }))
      .toEqual(previewRequestFingerprintFields({ ...base, requestedSlotId: 3 }));
  });
});
