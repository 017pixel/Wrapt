// UItests Anhänge-Batch: Notizen gehören zu ihrer Batchepoch. Ein zurück
// gehaltener Upload der früheren Auswahl darf nach einem Neubatch weder die
// Übersprungen- noch die Abbruchnotiz überschreiben; Slotwechsel der
// noch laufenden Auswahl bleiben sichtbar abgebrochen.
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatSessionView } from "./chat-types";
import { chatFixture, snapshot } from "./composer-area-fixtures";
import { useComposerAttachments } from "./useComposerAttachments";

const spendNote = (skipped: number) =>
  `Maximal 10 Anhänge pro Nachricht; ${skipped} übersprungen.`;
const abortNote =
  "Weitere Anhänge wurden ausgesetzt: Sitzungswechsel, Verbergen oder Abbruch.";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function attachHarness(held: () => Promise<void> = () => Promise.resolve()) {
  const chat = chatFixture({});
  chat.uploadAttachment = vi.fn(() => held());
  const snap = chat.activeSnapshot!;
  const hook = renderHook(
    ({ snap }: { snap: ChatSessionView }) =>
      useComposerAttachments(chat, snap, false, true),
    { initialProps: { snap } },
  );
  const rerender = (next: ChatSessionView) => {
    hook.rerender({ snap: next });
  };
  return { ...hook, result: hook.result, rerender, chat };
}

describe("useComposerAttachments – Notizepisode", () => {
  it("ein zurückgehaltener alter Batch überschreibt die Notiz des Neubatches nicht", async () => {
    const old = deferred();
    const harness = attachHarness(() => old.promise);
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["x"], "alt.png")],
        0,
      );
    });
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["y"], "neu.png")],
        2,
      );
    });
    expect(harness.result.current.attachNote).toBe(spendNote(2));
    await act(async () => {
      old.resolve();
    });
    expect(harness.result.current.attachNote).toBe(spendNote(2));
    expect(harness.chat.uploadAttachment).toHaveBeenCalledTimes(2);
  });

  it("ein neuer Batch ohne Überspringen räumt die alte Notiz ab", async () => {
    const old = deferred();
    const harness = attachHarness(() => old.promise);
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["x"], "alt.png")],
        2,
      );
    });
    expect(harness.result.current.attachNote).toBe(spendNote(2));
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["y"], "neu.png")],
        0,
      );
    });
    expect(harness.result.current.attachNote).toBeNull();
    await act(async () => {
      old.resolve();
    });
    expect(harness.result.current.attachNote).toBeNull();
  });

  it("die Abbruchnotiz der weiterhin aktuellen Auswahl bleibt sichtbar", async () => {
    const held = deferred();
    const harness = attachHarness(() => held.promise);
    const second = snapshot({ epoch: "e2" });
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["x"], "alt.png")],
        0,
      );
    });
    harness.rerender(second);
    await act(async () => {
      held.resolve();
    });
    expect(harness.result.current.attachNote).toBe(abortNote);
  });

  it("die Abbruchnotiz des laufenden Batches überlebt keine zweite Auswahl", async () => {
    const old = deferred();
    const harness = attachHarness(() => old.promise);
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["x"], "alt.png")],
        0,
      );
    });
    act(() => {
      harness.result.current.startAttachmentBatch(
        [new File(["y"], "neu.png")],
        0,
      );
    });
    await act(async () => {
      old.resolve();
    });
    expect(harness.result.current.attachNote).not.toBe(abortNote);
  });
});
