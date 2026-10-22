// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2SetupCard } from "./HermesV2SetupCard";
import { setupRequest, respondCapture } from "./request-card-fixtures";

describe("Setup-Karte", () => {
  afterEach(cleanup);

  it("zeigt die echten Optionen und sendet die Einzel-ID bei single", () => {
    const { values, onRespond } = respondCapture();
    render(
      <HermesV2SetupCard
        request={setupRequest()}
        blocked={false}
        blockedReason={null}
        onLock={vi.fn()}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("Zuhause")).toBeTruthy();
    expect(screen.getByText("Arbeit")).toBeTruthy();
    fireEvent.click(screen.getByText("Arbeit"));
    fireEvent.click(screen.getByText("Auswählen"));
    expect(values).toEqual([{ kind: "setup", picked: "opt.work" }]);
  });

  it("sendet bei multiple ein IDs-Array", () => {
    const { values, onRespond } = respondCapture();
    render(
      <HermesV2SetupCard
        request={setupRequest({ multiple: true })}
        blocked={false}
        blockedReason={null}
        onLock={vi.fn()}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByText("Zuhause"));
    fireEvent.click(screen.getByText("Arbeit"));
    fireEvent.click(screen.getByText("Auswählen"));
    expect(values).toEqual([
      { kind: "setup", picked: ["opt.home", "opt.work"] },
    ]);
  });

  it("Abbrechen sendet ausschließlich picked:null", () => {
    const { values, onRespond } = respondCapture();
    render(
      <HermesV2SetupCard
        request={setupRequest()}
        blocked={false}
        blockedReason={null}
        onLock={vi.fn()}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByText("Zuhause"));
    fireEvent.click(screen.getByText("Abbrechen"));
    expect(values).toEqual([{ kind: "setup", picked: null }]);
  });

  it("sperrt die Karte und zeigt den ruhigen Sperrgrund", () => {
    render(
      <HermesV2SetupCard
        request={setupRequest()}
        blocked
        blockedReason="Nur lesender Zugriff auf diese Sitzung."
        onLock={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    for (const input of screen.getAllByRole("radio"))
      expect(input.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Nur lesender Zugriff auf diese Sitzung."),
    ).toBeTruthy();
  });
});
