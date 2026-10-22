// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HermesV2Composer,
  type HermesV2ComposerProps,
} from "./HermesV2Composer";

function renderComposer(overrides: Partial<HermesV2ComposerProps> = {}) {
  const props: HermesV2ComposerProps = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    running: false,
    disabled: false,
    disabledReason: null,
    submitting: false,
    ...overrides,
  };
  render(<HermesV2Composer {...props} />);
  return props;
}

const input = () =>
  screen.getByRole("textbox", {
    name: "Nachricht an Hermes",
  }) as HTMLTextAreaElement;

describe("HermesV2Composer", () => {
  afterEach(cleanup);

  it("hat den accessible Namen Nachricht an Hermes und leitet Eingaben weiter", () => {
    const props = renderComposer();
    fireEvent.change(input(), { target: { value: "Eigener Text" } });
    expect(props.onChange).toHaveBeenCalledWith("Eigener Text");
  });

  it("sendet mit Enter, hält aber bei Shift+Enter und leerem Text zurück", () => {
    const props = renderComposer({ value: "Erste Zeile" });
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
    expect(props.onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("sendet keinen leeren Text", () => {
    const props = renderComposer();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("sendet während IME-Composition nicht", () => {
    const props = renderComposer({ value: "IME-Text" });
    const element = input();
    fireEvent.compositionStart(element);
    fireEvent.keyDown(element, { key: "Enter" });
    expect(props.onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(element);
    fireEvent.keyDown(element, { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("unterdrückt isComposing-Enter und synchron wiederholtes Senden", () => {
    const props = renderComposer({ value: "Text" });
    const element = input();
    fireEvent.keyDown(element, { key: "Enter", isComposing: true });
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("sperrt synchrones Doppelsenden während laufender Send-Aktion", () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
    renderComposer({ value: "Text", onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("sperrt bei ablaufendem Senden, lässt aber das Stoppen des laufenden Turns zu", () => {
    const onStop = vi.fn();
    const props = renderComposer({
      value: "Text",
      submitting: true,
      running: true,
      onStop,
    });
    const send = screen.getByRole("button", { name: /Senden/ });
    expect(send.hasAttribute("disabled")).toBe(true);
    const stop = screen.getByRole("button", { name: "Stoppen" });
    fireEvent.click(stop);
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(2); // UI sperrt nicht; Runtime regelt Priorität.
    fireEvent.click(send);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("zeigt Stoppen bei laufender Arbeit und erklärt gesperrte Eingaben", () => {
    renderComposer({
      running: true,
      disabled: true,
      disabledReason: "Keine Verbindung zu Hermes.",
    });
    expect(screen.getByRole("button", { name: "Stoppen" })).toBeTruthy();
    // Der Sperrgrund steht am Feld und am Senden, nicht als eigene Zeile.
    expect(input().getAttribute("placeholder")).toContain(
      "Keine Verbindung zu Hermes.",
    );
    const send = screen.getByRole("button", { name: "Senden" });
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(send.getAttribute("title")).toContain("Keine Verbindung");
    expect(document.body.textContent).not.toContain(
      "Keine Verbindung zu Hermes.",
    );
  });
});
