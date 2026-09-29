import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { requestOrbitNodeFocus } from "../../lib/orbitFocusRequest";
import { focusFromHeader } from "./OrbitNodeFocusAction";

vi.mock("../../lib/orbitFocusRequest", () => ({ requestOrbitNodeFocus: vi.fn() }));

describe("focusFromHeader", () => {
  it("verhindert Fokuswechsel beim Doppelklick in editierbaren Titeln", () => {
    const target = { closest: vi.fn(() => ({} as Element)) };
    const stopPropagation = vi.fn();

    focusFromHeader({ target, stopPropagation } as unknown as MouseEvent<HTMLElement>, "node-1");

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(target.closest).toHaveBeenCalledWith(expect.stringContaining("[contenteditable]"));
    expect(requestOrbitNodeFocus).not.toHaveBeenCalled();
  });

  it("zentriert beim Doppelklick auf eine nicht interaktive Kopfzeilenfläche", () => {
    const target = { closest: vi.fn(() => null) };

    focusFromHeader({ target, stopPropagation: vi.fn() } as unknown as MouseEvent<HTMLElement>, "node-2");

    expect(requestOrbitNodeFocus).toHaveBeenCalledWith("node-2");
  });
});
