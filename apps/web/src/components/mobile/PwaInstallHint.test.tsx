// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PWA_INSTALL_HINT_DISMISSED_KEY, PwaInstallHint } from "./PwaInstallHint";

const pwa = vi.hoisted(() => ({
  isAppleMobile: true,
  isInstalled: false,
  canInstall: false,
  install: vi.fn(),
}));

vi.mock("../../lib/usePwaInstall", () => ({
  usePwaInstall: () => pwa,
}));

describe("PwaInstallHint", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pwa.isAppleMobile = true;
    pwa.isInstalled = false;
    pwa.canInstall = false;
    pwa.install.mockReset();
  });

  it("zeigt den iOS-Hinweis und merkt sich das Ausblenden", () => {
    const { rerender } = render(<PwaInstallHint />);

    expect(screen.getByText(/Zum Home-Bildschirm/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Installationshinweis ausblenden" }));

    expect(window.localStorage.getItem(PWA_INSTALL_HINT_DISMISSED_KEY)).toBe("1");
    rerender(<PwaInstallHint />);
    expect(screen.queryByLabelText("Wrapt installieren")).toBeNull();
  });

  it("zeigt keinen Hinweis für eine bereits installierte App", () => {
    pwa.isInstalled = true;
    render(<PwaInstallHint />);

    expect(screen.queryByLabelText("Wrapt installieren")).toBeNull();
  });
});
