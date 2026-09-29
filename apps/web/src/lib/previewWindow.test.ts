import { describe, expect, it } from "vitest";
import { orbitPreviewSessionKey, parsePreviewLiveWindowSearch } from "./previewWindow";

describe("Preview-Fensteridentität", () => {
  it("übernimmt Preview-Knoten, Slotbindung und Storageprofil in die Live-Route", () => {
    const sessionKey = orbitPreviewSessionKey({
      projectId: "projekt",
      previewTarget: "5173/shop",
      storageProfileId: "profil-1",
    });
    const input = parsePreviewLiveWindowSearch(
      `?project=projekt&port=5173&path=%2Fshop&node=knoten-1&session=${encodeURIComponent(sessionKey)}&slot=17&isolate=1&storage=profil-1&title=Shop`,
    );

    expect(input).toEqual({
      projectId: "projekt",
      port: 5173,
      path: "/shop",
      title: "Shop",
      sessionKey,
      previewNodeId: "knoten-1",
      requestedSlotId: 17,
      isolate: true,
      storageProfileId: "profil-1",
    });
  });

  it("verwendet Projekt, normalisiertes Ziel und Storageprofil statt einer Knoten-ID", () => {
    const input = parsePreviewLiveWindowSearch("?project=projekt&port=5173&path=%2Fshop&storage=profil-1&node=knoten-1");
    expect(input?.sessionKey).toBe(orbitPreviewSessionKey({
      projectId: "projekt",
      previewTarget: "5173/shop",
      storageProfileId: "profil-1",
    }));
    expect(input?.sessionKey).not.toContain("knoten-1");
    expect(input?.requestedSlotId).toBeNull();
    expect(input?.isolate).toBe(false);
  });

  it("normalisiert äquivalente lokale Ziele und hält den Sitzungsschlüssel unter 160 Zeichen", () => {
    const shortTarget = orbitPreviewSessionKey({ projectId: "projekt", previewTarget: "5173/shop" });
    const fullTarget = orbitPreviewSessionKey({ projectId: "projekt", previewTarget: "http://localhost:5173/shop" });
    expect(fullTarget).toBe(shortTarget);
    expect(shortTarget.length).toBeLessThan(160);
    expect(orbitPreviewSessionKey({ projectId: "anderes-projekt", previewTarget: "5173/shop" })).not.toBe(shortTarget);
    expect(orbitPreviewSessionKey({ projectId: "projekt", previewTarget: "5173/anderer-pfad" })).not.toBe(shortTarget);
    expect(orbitPreviewSessionKey({ projectId: "projekt", previewTarget: "5173/shop", storageProfileId: "profil-1" })).not.toBe(shortTarget);
  });

  it("hält die Laufzeitidentität stabil, wenn der Server einen Slot zuweist", () => {
    const beforeAssignment = orbitPreviewSessionKey({ projectId: "projekt", previewTarget: "5173", previewSlotId: null });
    const afterAssignment = orbitPreviewSessionKey({ projectId: "projekt", previewTarget: "5173", previewSlotId: 17 });
    expect(afterAssignment).toBe(beforeAssignment);
  });

  it("weist ungültige lokale Ziele und Slot-IDs ab", () => {
    expect(parsePreviewLiveWindowSearch("?project=projekt&port=0")).toBeNull();
    const input = parsePreviewLiveWindowSearch("?project=projekt&port=5173&slot=-1");
    expect(input?.requestedSlotId).toBeNull();
  });
});
