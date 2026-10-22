// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HermesV2ToolDetails, toolInputParts } from "./HermesV2ToolDetails";

afterEach(cleanup);

describe("Lesbare Werkzeugdetails", () => {
  it("trennt mehrzeilige Befehle von Parametern und behält alle Angaben", () => {
    expect(toolInputParts(JSON.stringify({ command: "pwd\nls -la", cwd: "/projekt", timeout: 30 }))).toEqual({
      command: "pwd\nls -la", parameters: '{\n  "cwd": "/projekt",\n  "timeout": 30\n}',
    });
    expect(toolInputParts('{"cmd":"pwd"}')).toEqual({ command: "pwd", parameters: null });
  });

  it("behält nicht erkannte Eingaben und formatiert JSON", () => {
    expect(toolInputParts("kein JSON").parameters).toBe("kein JSON");
    expect(toolInputParts('{"url":"/projekt"}').parameters).toBe('{\n  "url": "/projekt"\n}');
  });

  it("zeigt Ausgaben als Text und führt enthaltenes HTML nicht aus", () => {
    const { container } = render(<HermesV2ToolDetails tool={{
      id: "t1", toolId: "t1", turnId: "turn", name: "terminal", status: "complete",
      outcome: "success", input: '{"command":"ls -la"}',
      output: '<script>alert("test")</script>\nDatei gefunden', durationMs: 1000,
    }} />);
    expect(screen.getByRole("heading", { name: "Befehl" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ausgabe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Befehl kopieren" })).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".is-output")?.textContent).toContain('<script>alert("test")</script>');
  });
});
