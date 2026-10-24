// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { useHermesV2Selection } from "./shell-selection";

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  const selection = useHermesV2Selection(
    "route",
    undefined,
    undefined,
    location.pathname.endsWith("/hermes-agent"),
  );
  return (
    <>
      <output data-testid="selection">{selection.sessionId ?? ""}</output>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <button type="button" onClick={() => navigate("/hermes-agent")}>
        Öffnen
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Zurück
      </button>
    </>
  );
}

describe("HermesV2 route selection persistence", () => {
  afterEach(cleanup);

  it("stellt den zuletzt geöffneten Chat nach einem Werkzeugwechsel wieder her", async () => {
    const first = render(
      <MemoryRouter initialEntries={["/hermes-agent?session=saved"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(first.getByTestId("selection").textContent).toBe("saved");
    first.unmount();

    const second = render(
      <MemoryRouter initialEntries={["/hermes-agent"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(second.getByTestId("selection").textContent).toBe("saved");
    await waitFor(() =>
      expect(second.getByTestId("location").textContent).toContain(
        "session=saved",
      ),
    );
  });

  it("ersetzt den leeren Eintrag, damit Zurück beim Werkzeugwechsel bleibt", async () => {
    window.sessionStorage.setItem("wrapt.hermes-v2.last-session", "saved");
    const view = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Probe />
      </MemoryRouter>,
    );
    fireEvent.click(view.getByRole("button", { name: "Öffnen" }));
    await waitFor(() =>
      expect(view.getByTestId("location").textContent).toBe(
        "/hermes-agent?session=saved",
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Zurück" }));
    await waitFor(() =>
      expect(view.getByTestId("location").textContent).toBe("/dashboard"),
    );
  });
});
