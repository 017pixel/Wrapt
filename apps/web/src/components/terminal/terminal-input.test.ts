// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { attachTerminalInput, flushTerminalReplay, sendTerminalSequence, type TerminalInputContext } from "./terminal-input";

function touchEvent(type: string, points: Array<{ clientX: number; clientY: number }>): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, "touches", { value: points });
  return event;
}

function setupInput(active = true) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const scrollByLines = vi.fn();
  const focusedRef = { current: active };
  const terminal = {
    rows: 20,
    cols: 80,
    element: mount,
    buffer: { active: { type: "normal", baseY: 0, viewportY: 0 } },
    modes: { mouseTrackingMode: "none" },
    attachCustomKeyEventHandler: vi.fn(),
    attachCustomWheelEventHandler: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    hasSelection: vi.fn(() => false),
    select: vi.fn(),
  } as unknown as Terminal;
  const context = {
    send: vi.fn<(message: object) => boolean>(() => true),
    setError: vi.fn(),
    sessionRef: { current: "session-1" },
    snapshotReplayRef: { current: false as boolean },
    replayBufferRef: { current: [] as string[] },
    mouseTrackingRef: { current: false as boolean },
    kindRef: { current: "shell" as const },
    terminalRef: { current: terminal },
    rememberTyping: vi.fn(),
    copySelection: vi.fn(),
    receivePastedText: vi.fn(),
    scrollByLines,
    focusedRef,
  } satisfies TerminalInputContext;
  const dispose = attachTerminalInput(terminal, mount, context);
  return { mount, terminal, context, scrollByLines, focusedRef, dispose };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Terminal-Scroll-Lifecycle", () => {
  it("scrollt per Wheel ohne vorherige Textauswahl", () => {
    const { mount, scrollByLines, dispose } = setupInput();

    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, deltaMode: 0, bubbles: true, cancelable: true }));

    expect(scrollByLines).toHaveBeenCalledWith(2);
    dispose();
  });

  it("bleibt nach einer Auswahl und deren Aufhebung scrollbar", () => {
    const { mount, scrollByLines, dispose } = setupInput();

    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    mount.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    mount.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));

    expect(scrollByLines).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("bleibt nach einem Kopierversuch ohne Auswahl scrollbar", () => {
    const { mount, terminal, context, scrollByLines, dispose } = setupInput();
    context.copySelection.mockImplementation(() => context.setError("Wähle zuerst Text im Terminal aus."));
    const keyHandler = vi.mocked(terminal.attachCustomKeyEventHandler).mock.calls[0]?.[0];

    expect(keyHandler?.(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, shiftKey: true }))).toBe(false);
    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, deltaMode: 0, bubbles: true, cancelable: true }));

    expect(context.setError).toHaveBeenCalledWith("Wähle zuerst Text im Terminal aus.");
    expect(scrollByLines).toHaveBeenCalledWith(2);
    dispose();
  });

  it("scrollt ausschließlich im aktiven Pane", () => {
    const { mount, scrollByLines, focusedRef, dispose } = setupInput(false);

    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    mount.dispatchEvent(touchEvent("touchstart", [{ clientX: 10, clientY: 100 }]));
    mount.dispatchEvent(touchEvent("touchmove", [{ clientX: 10, clientY: 70 }]));
    mount.dispatchEvent(touchEvent("touchmove", [{ clientX: 10, clientY: 40 }]));
    expect(scrollByLines).not.toHaveBeenCalled();

    focusedRef.current = true;
    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    expect(scrollByLines).toHaveBeenCalledWith(2);
    dispose();
  });

  it("setzt Handler nach Tab-/Werkzeugwechsel und Reload nicht doppelt an", () => {
    const first = setupInput();
    first.mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    expect(first.scrollByLines).toHaveBeenCalledTimes(1);
    first.dispose();

    const reloadedDispose = attachTerminalInput(first.terminal, first.mount, first.context);
    first.mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    expect(first.scrollByLines).toHaveBeenCalledTimes(2);
    reloadedDispose();
  });

  it("wählt im gescrollten Verlauf relativ zum sichtbaren Viewport aus", () => {
    const { mount, terminal, context, dispose } = setupInput();
    context.mouseTrackingRef.current = true;
    Object.assign(terminal.buffer.active, { baseY: 500, viewportY: 100 });
    vi.spyOn(mount, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400,
      toJSON: () => ({}),
    });

    mount.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 12, clientY: 10, bubbles: true }));
    mount.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 92, clientY: 30, bubbles: true }));
    mount.dispatchEvent(new MouseEvent("mouseup", { button: 0, clientX: 92, clientY: 30, bubbles: true }));

    expect(terminal.select).toHaveBeenCalledWith(1, 100, 89);
    dispose();
  });

  it("puffert während des Snapshot-Replays Pfeile, Alt, Escape und Maus statt sie zu verwerfen", () => {
    const { terminal, context, dispose } = setupInput();
    const emit = vi.mocked(terminal.onData).mock.calls[0]![0];
    context.snapshotReplayRef.current = true;

    for (const data of ["\x1b[A", "\x1bb", "\x1b", "\x1b[<0;1;1M", "\x1b[M !!"]) emit(data);

    expect(context.replayBufferRef.current).toEqual(["\x1b[A", "\x1bb", "\x1b", "\x1b[<0;1;1M", "\x1b[M !!"]);
    expect(context.send).not.toHaveBeenCalled();
    expect(context.rememberTyping).not.toHaveBeenCalled();
    dispose();
  });

  it("puffert Backspace und Delete während des Snapshot-Replays wie andere Sequenzen", () => {
    const { terminal, context, dispose } = setupInput();
    const keyHandler = vi.mocked(terminal.attachCustomKeyEventHandler).mock.calls[0]![0];
    context.snapshotReplayRef.current = true;

    expect(keyHandler?.(new KeyboardEvent("keydown", { key: "Backspace" }))).toBe(false);
    expect(keyHandler?.(new KeyboardEvent("keydown", { key: "Delete" }))).toBe(false);

    expect(context.replayBufferRef.current).toEqual(["\x7f", "\x1b[3~"]);
    expect(context.send).not.toHaveBeenCalled();
    dispose();
  });

  it("meldet eine wegen fehlender Verbindung nicht gesendete Sondertaste sichtbar", () => {
    const { terminal, context, dispose } = setupInput();
    const keyHandler = vi.mocked(terminal.attachCustomKeyEventHandler).mock.calls[0]![0];
    context.send.mockReturnValueOnce(false);

    expect(keyHandler?.(new KeyboardEvent("keydown", { key: "Backspace" }))).toBe(false);

    expect(context.setError).toHaveBeenCalledWith(expect.stringContaining("nicht vollständig gesendet"));
    expect(context.replayBufferRef.current).toEqual([]);
    dispose();
  });

  it("sendet Keybar-Sequenzen nach dem Replay einmalig und in Reihenfolge", () => {
    const { context, dispose } = setupInput();
    const sent: string[] = [];
    context.send.mockImplementation((message) => { sent.push((message as { data: string }).data); return true; });
    context.snapshotReplayRef.current = true;

    sendTerminalSequence("\x1b[A", context);
    sendTerminalSequence("\x1b", context);
    expect(sent).toEqual([]);
    expect(context.replayBufferRef.current).toEqual(["\x1b[A", "\x1b"]);

    context.snapshotReplayRef.current = false;
    const chunks = context.replayBufferRef.current;
    context.replayBufferRef.current = [];
    flushTerminalReplay(chunks, (data) => {
      context.send({ type: "terminal.input", sessionId: "session-1", data });
      return true;
    }, context.rememberTyping, context.setError);
    expect(sent).toEqual(["\x1b[A", "\x1b"]);
    expect(context.rememberTyping).toHaveBeenNthCalledWith(1, "\x1b[A");
    expect(context.rememberTyping).toHaveBeenNthCalledWith(2, "\x1b");
    dispose();
  });

  it("bricht bei einem Teilversand ab und wiederholt bereits gesendete Blöcke nicht", () => {
    const sent: string[] = [];
    const remember = vi.fn();
    const onError = vi.fn();
    const send = vi.fn((data: string) => {
      sent.push(data);
      return sent.length < 3;
    });

    flushTerminalReplay(["\x1b[A", "abc", "\x1b"], send, remember, onError);

    expect(sent).toEqual(["\x1b[A", "abc", "\x1b"]);
    expect(remember.mock.calls.map(([data]) => data)).toEqual(["\x1b[A", "abc"]);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("nicht vollständig gesendet"));
  });

  it("normalisiert eine rückwärts gezogene Auswahl in derselben Zeile", () => {
    const { mount, terminal, context, dispose } = setupInput();
    context.mouseTrackingRef.current = true;
    vi.spyOn(mount, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400,
      toJSON: () => ({}),
    });

    mount.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 105, clientY: 10, bubbles: true }));
    mount.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 25, clientY: 10, bubbles: true }));
    mount.dispatchEvent(new MouseEvent("mouseup", { button: 0, clientX: 25, clientY: 10, bubbles: true }));

    expect(terminal.select).toHaveBeenCalledWith(2, 0, 9);
    dispose();
  });
});
