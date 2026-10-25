// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorFrame } from "./EditorFrame";
import { useEditorRuntime } from "./runtime";
import { editorTiming } from "../../config/editor";

afterEach(() => { cleanup(); vi.useRealTimers(); useEditorRuntime.setState({ ready: {}, files: {} }); });
describe("Editor-Lebenszyklus", () => {
  it("erhält iframe und Eingaben beim Verbindungsverlust und beim Wiederverbinden", () => {
    useEditorRuntime.getState().setReady("/projekt", true);
    const { rerender } = render(<EditorFrame source="/editor/?folder=projekt" folder="/projekt" />);
    const frame = screen.getByTitle("Editor");
    fireEvent.load(frame);
    expect(screen.queryByText(/wird verbunden/)).toBeNull();
    act(() => useEditorRuntime.getState().setReady("/projekt", false));
    expect(screen.getByText(/Eingaben bleiben/)).not.toBeNull();
    act(() => useEditorRuntime.getState().setReady("/projekt", true));
    rerender(<EditorFrame source="/editor/?folder=projekt" folder="/projekt" />);
    expect(screen.getByTitle("Editor")).toBe(frame);
    expect(screen.queryByText(/Eingaben bleiben/)).toBeNull();
  });

  it("bietet nach Timeout einen manuellen Retry statt automatischer Reloads", () => {
    vi.useFakeTimers();
    render(<EditorFrame source="/editor/" folder="/projekt" />);
    const frame = screen.getByTitle("Editor");
    act(() => vi.advanceTimersByTime(editorTiming.documentTimeoutMs));
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByTitle("Editor")).toBe(frame);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(screen.getByTitle("Editor")).not.toBe(frame);
  });

  it("öffnet ein anfängliches Dateiziel URL-sicher und erhält eine bedienbare Fallback-Ansicht", () => {
    vi.useFakeTimers();
    useEditorRuntime.getState().rememberFile("/projekt", "/projekt/datei #.ts");
    render(<EditorFrame source="/editor/?folder=%2Fprojekt" folder="/projekt" />);
    const frame = screen.getByTitle("Editor");
    const url = new URL(frame.getAttribute("src")!, "http://localhost");
    expect(JSON.parse(url.searchParams.get("payload")!)[0][1]).toContain("datei%20%23.ts");
    fireEvent.load(frame);
    act(() => vi.advanceTimersByTime(editorTiming.runtimeGraceMs));
    expect(screen.getByText(/Editor bleibt bedienbar/)).not.toBeNull();
    expect(screen.getByTitle("Editor")).toBe(frame);
  });
});
