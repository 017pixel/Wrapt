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
    (props: { hour?: number; napDelayMs?: number; mood: typeof mood }) =>
      useCapybaraBehavior(props.mood, false, stage, {
        hour: 12,
        ...(props.napDelayMs !== undefined ? { napDelayMs: props.napDelayMs } : {}),
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
    // Die Frist liegt über der Gähndauer, sonst schläft es direkt wieder ein.
    const { result } = renderBehavior({ napDelayMs: 2_000 });
    expect(result.current.sleeping).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2_000);
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
    expect(result.current.frame).toBe("blink");

    act(() => {
      vi.advanceTimersByTime(1_985);
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
      vi.advanceTimersByTime(4_250);
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
    expect(result.current.frame).toBe("blink");
    act(() => {
      vi.advanceTimersByTime(190);
    });
    expect(result.current.frame).toBe("yawnA");
    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(result.current.frame).toBe("yawnB");
  });

  it("zeigt neue Aktionen bei reduzierter Bewegung als ruhige Einzelpose", () => {
    const { result } = renderHook(() => useCapybaraBehavior("calm", true, stage, { hour: 12 }));
    act(() => {
      result.current.play("stretch");
    });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.action).toBe("stretch");
    expect(result.current.frame).toBe("hopA");
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(result.current.action).toBe("idle");
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
    expect(result.current.frame).toBe("blink");

    act(() => {
      vi.advanceTimersByTime(2_050);
    });
    expect(result.current.frame).toBe("calm");
  });

  it.each([
    "stretch", "sniff", "wave", "bow", "wiggle",
  ] as const)("spielt %s vollständig ab", (action) => {
    const { result } = renderBehavior();
    act(() => {
      result.current.play(action);
      vi.advanceTimersByTime(1);
    });
    expect(result.current.action).toBe(action);
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(result.current.frame).toBe("calm");
    expect(result.current.action).toBe("idle");
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
