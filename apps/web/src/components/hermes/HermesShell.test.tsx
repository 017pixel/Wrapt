// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Panel } from "@wrapt/contracts";
import { useAppPreferences } from "../../stores/appPreferences";
import { PersistentOutlet } from "../PersistentOutlet";
import { HermesShell } from "./HermesShell";

vi.mock("./v2/HermesV2Shell", () => ({
  HermesV2Shell: ({ variant }: { variant: string }) => <section data-testid="native-hermes">{variant}</section>,
}));

const panel: Panel = {
  id: "hermes-test", type: "hermes", projectId: null, previewId: null, reloadKey: 0,
};

beforeEach(() => useAppPreferences.setState({ hermesV2Enabled: false }));
afterEach(cleanup);

function mount(path = "/hermes-agent", variant: "route" | "panel" | "orbit" = "route", customPanel?: Panel) {
  return render(<MemoryRouter initialEntries={[path]}><HermesShell variant={variant} {...(customPanel ? { panel: customPanel } : {})} /></MemoryRouter>);
}

function ParkedSurface({ classic }: { classic: boolean }) {
  const navigate = useNavigate();
  return <>
    <button onClick={() => { void navigate(classic ? "/settings" : "/settings?path=anderer-bereich"); }}>Parken</button>
    <button onClick={() => { void navigate(classic ? "/hermes-agent?ui=classic" : "/hermes-agent"); }}>Zurück</button>
    <Routes>
      <Route element={<PersistentOutlet />}>
        <Route path="/hermes-agent" element={<HermesShell variant="route" />} />
        <Route path="/settings" element={<p>Einstellungen</p>} />
      </Route>
    </Routes>
  </>;
}

describe("Hermes-Oberflächenwahl", () => {
  it.each(["route", "panel", "orbit"] as const)("erhält V1 standardmäßig in %s", (variant) => {
    mount("/hermes-agent", variant);
    expect(screen.getByTitle("Hermes Agent").getAttribute("src")).toBe("/hermes/chat");
    expect(screen.queryByTestId("native-hermes")).toBeNull();
  });

  it.each(["route", "panel", "orbit"] as const)("öffnet V2 bei aktivem Flag in %s", async (variant) => {
    useAppPreferences.getState().setHermesV2Enabled(true);
    mount("/hermes-agent", variant);
    expect((await screen.findByTestId("native-hermes")).textContent).toBe(variant);
    expect(screen.queryByTitle("Hermes Agent")).toBeNull();
  });

  it.each([
    ["/hermes-agent?ui=classic", "/hermes/chat"],
    ["/hermes-agent?path=%2Fcron%2Fjob-1", "/hermes/cron/job-1"],
    ["/hermes-agent?ui=classic&session=stored%2Fid", "/hermes/chat?resume=stored%2Fid"],
  ])("erhält den expliziten Classic-Link %s", (path, target) => {
    useAppPreferences.getState().setHermesV2Enabled(true);
    mount(path);
    expect(screen.getByTitle("Hermes Agent").getAttribute("src")).toBe(target);
  });

  it("erhält gespeicherte Verwaltungsziele eines Panels", () => {
    useAppPreferences.getState().setHermesV2Enabled(true);
    mount("/workbench", "panel", { ...panel, hermesAdminPath: "/settings" });
    expect(screen.getByTitle("Hermes Agent").getAttribute("src")).toBe("/hermes/settings");
  });

  it("stellt V1 beim Abschalten ohne Reload wieder her", async () => {
    mount("/hermes-agent?session=original");
    expect(screen.getByTitle("Hermes Agent").getAttribute("src")).toBe("/hermes/chat?resume=original");
    act(() => useAppPreferences.getState().setHermesV2Enabled(true));
    await screen.findByTestId("native-hermes");
    act(() => useAppPreferences.getState().setHermesV2Enabled(false));
    expect(screen.getByTitle("Hermes Agent").getAttribute("src")).toBe("/hermes/chat?resume=original");
  });

  it("erhält dasselbe klassische iframe beim Parken und Zurückkehren", () => {
    useAppPreferences.getState().setHermesV2Enabled(true);
    render(<MemoryRouter initialEntries={["/hermes-agent?ui=classic"]}><ParkedSurface classic /></MemoryRouter>);
    const frame = screen.getByTitle("Hermes Agent");
    fireEvent.click(screen.getByText("Parken"));
    expect(screen.getByTitle("Hermes Agent")).toBe(frame);
    expect(screen.queryByTestId("native-hermes")).toBeNull();
    fireEvent.click(screen.getByText("Zurück"));
    expect(screen.getByTitle("Hermes Agent")).toBe(frame);
  });

  it("wertet Verwaltungsparameter anderer Seiten in einer geparkten V2-Route nicht aus", async () => {
    useAppPreferences.getState().setHermesV2Enabled(true);
    render(<MemoryRouter initialEntries={["/hermes-agent"]}><ParkedSurface classic={false} /></MemoryRouter>);
    await screen.findByTestId("native-hermes");
    fireEvent.click(screen.getByText("Parken"));
    expect(screen.queryByTitle("Hermes Agent")).toBeNull();
    expect(screen.getByTestId("native-hermes")).toBeTruthy();
    act(() => useAppPreferences.getState().setHermesV2Enabled(false));
    expect(screen.getByTitle("Hermes Agent")).toBeTruthy();
  });
});
