// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2ConfigurationArea } from "./HermesV2ConfigurationArea";

const initial = () => ({ scope: "a".repeat(64), profile: "default", model: "test-model", approvalMode: "manual", values: { timezone: "Europe/Berlin", maxTurns: 90, compressionEnabled: true } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Eigene Konfigurationsansicht", () => {
  it("sendet nur geänderte Werte und zeigt den bestätigten Stand", async () => {
    const data = initial();
    const fetcher = vi.fn(async (_path: string, init: RequestInit) => {
      if (init.method === "PUT") data.values.maxTurns = 120;
      return new Response(JSON.stringify(data));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<HermesV2ConfigurationArea active />);
    const input = await screen.findByRole("spinbutton", { name: "Maximale Schritte" });
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await screen.findByText("Änderungen gespeichert.");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body as string)).toMatchObject({ changes: { maxTurns: 120 }, expected: { maxTurns: 90 } });
  });
  it("blockiert nach unklarem Ausgang bis zu bewusstem Neuladen", async () => {
    const fetcher = vi.fn(async (_path: string, init: RequestInit) => {
      if (init.method === "PUT") throw new Error("Verbindung verloren");
      return new Response(JSON.stringify(initial()));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<HermesV2ConfigurationArea active />);
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Maximale Schritte" }), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Ergebnis unklar");
    expect((screen.getByRole("button", { name: "Änderungen speichern" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Konfiguration neu laden" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await waitFor(() => expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(false));
  });
});
