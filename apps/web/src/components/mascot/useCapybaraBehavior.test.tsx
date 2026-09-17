// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCapybaraBehavior } from "./useCapybaraBehavior";

const stage = { width: 400, itemWidth: 78 };

function renderBehavior(
  options: Parameters<typeof useCapybaraBehavior>[3] = {},
  mood: Parameters<typeof useCapybaraBehavior>[0] = "calm",
) {
  return renderHook(
    (props: { hour?: number; gaze?: "left" | "right" | null; napDelayMs?: number; mood: typeof mood }) =>
      useCapybaraBehavior(props.mood, false, stage, {
        hour: 12,
        ...(props.napDelayMs !== undefined ? { napDelayMs: props.napDelayMs } : {}),
        ...(props.gaze !== undefined ? { gaze: props.gaze } : {}),
      }),
    { initialProps: { mood, ...options } },
  );
}

describe("useCapybaraBehavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("schläft nach der Ruhefrist ein und gähnt beim Aufwachen", () => {
    const { result } = renderBehavior({ napDelayMs: 1_000 });
    expect(result.current.sleeping).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.sleeping).toBe(true);
    expect(result.current.frame).toBe("sleep");
    expect(result.current.action).toBe("sleep");

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.sleeping).toBe(false);
    expect(result.current.frame).toBe("yawnA");

    act(() => {
      vi.advanceTimersByTime(970);
    });
    expect(result.current.frame).toBe("calm");
  });

  it("blickt zum Zeiger, solange er in der Nähe ist", () => {
    const { result, rerender } = renderBehavior({ gaze: null });
    expect(result.current.frame).toBe("calm");

    // Die Blickpose wird gespiegelt, damit die Augen zum Zeiger zeigen.
    rerender({ mood: "calm", gaze: "left", hour: 12 });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.frame).toBe("lookRight");
    expect(result.current.action).toBe("look");
    expect(result.current.facing).toBe("left");

    rerender({ mood: "calm", gaze: "right", hour: 12 });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.frame).toBe("lookRight");
    expect(result.current.facing).toBe("right");

    rerender({ mood: "calm", gaze: null, hour: 12 });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.frame).toBe("calm");
  });

  it("tanzt auf Kommando mit Hut", () => {
    const { result } = renderBehavior();
    act(() => {
      result.current.play("party");
    });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.frame).toBe("party");
    expect(result.current.action).toBe("celebrate");

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.frame).toBe("calm");
  });

  it("gähnt auf Kommando", () => {
    const { result } = renderBehavior();
    act(() => {
      result.current.play("yawn");
    });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.frame).toBe("yawnA");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.frame).toBe("yawnB");
  });

  it("bleibt im Nickerchen, bis es geweckt wird", () => {
    const { result } = renderBehavior();
    act(() => {
      result.current.nap();
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.sleeping).toBe(true);
    expect(result.current.frame).toBe("sleep");

    // Ein Klick weckt es mit einem Gähnen.
    act(() => {
      result.current.poke();
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.sleeping).toBe(false);
    expect(result.current.frame).toBe("yawnA");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.frame).toBe("calm");
  });

  it("gähnt nicht, wenn die Verbindung fehlt", () => {
    const { result } = renderBehavior({ napDelayMs: 500 }, "sleep");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.sleeping).toBe(true);
    expect(result.current.frame).toBe("sleep");

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
      vi.advanceTimersByTime(10);
    });
    expect(result.current.frame).toBe("sleep");
  });
});
