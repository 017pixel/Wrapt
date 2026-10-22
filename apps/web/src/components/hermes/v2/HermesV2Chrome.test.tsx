// Kopfleiste und Fußzeile der Hermes-V2-Oberfläche: ein neuer Chat kommt
// ausschließlich über die Seitenleiste, die Einstellungen liegen in den
// Wrapt-Einstellungen.
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2ChatHeader, HermesV2SidebarBrand, HermesV2SidebarFooter } from "./HermesV2Chrome";

describe("HermesV2Chrome", () => {
  afterEach(cleanup);

  it("hält in der Kopfleiste keinen Knopf für einen neuen Chat bereit", () => {
    render(
      <MemoryRouter>
        <HermesV2ChatHeader
          title="Sitzung"
          area="chat"
          sessionId="s1"
          standalone={false}
          drawerId="drawer-1"
          sidebarExpanded
          onToggleSidebar={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Sitzung", level: 1 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Neuer Chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Neue Sitzung" })).toBeNull();
  });

  it("verlinkt im Standalone-Fall zurück zur Workbench", () => {
    render(
      <MemoryRouter>
        <HermesV2SidebarFooter standalone />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Zur Workbench" })).toBeTruthy();
  });

  it("zeigt in der Workbench keinen Einstellungs- und keinen Rücklink", () => {
    const { container } = render(
      <MemoryRouter>
        <HermesV2SidebarFooter standalone={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "Einstellungen" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Zur Workbench" })).toBeNull();
    expect(container.querySelector(".hermesv2-sidebar-footer")).toBeNull();
  });

  it("zeigt in der Spalte keine Marke und behält nur den Schließer des Drawers", () => {
    // Die breite Spalte beginnt mit der Suchreihe: keine Wortmarke.
    const { container, rerender } = render(<HermesV2SidebarBrand />);
    expect(container.querySelector(".hermesv2-sidebar-brand")).toBeNull();
    expect(screen.queryByText("Agent")).toBeNull();
    // Im Drawer bleibt der Knopf zum Schließen.
    rerender(<HermesV2SidebarBrand onClose={() => undefined} />);
    expect(
      screen.getByRole("button", { name: "Sitzungsspalte schließen" }),
    ).toBeTruthy();
    expect(screen.queryByText("Agent")).toBeNull();
  });
});
