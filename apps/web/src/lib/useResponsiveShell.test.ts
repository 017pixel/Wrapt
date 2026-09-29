import { describe, expect, it } from "vitest";
import { usesTabletSidebar } from "./useResponsiveShell";

describe("usesTabletSidebar", () => {
  it("uses the collapsible sidebar on tablet landscape", () => {
    expect(usesTabletSidebar("tablet", "landscape")).toBe(true);
  });

  it("keeps tablet portrait and phone layouts on mobile navigation", () => {
    expect(usesTabletSidebar("tablet", "portrait")).toBe(false);
    expect(usesTabletSidebar("compact", "landscape")).toBe(false);
  });
});
