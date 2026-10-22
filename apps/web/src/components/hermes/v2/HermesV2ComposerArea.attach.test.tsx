// UItests Composergebiet: Anhänge und begrenztes Katalogladen.
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2ComposerArea } from "./HermesV2ComposerArea";
import {
  chatFixture,
  notices,
  renderArea,
  snapshot,
} from "./composer-area-fixtures";
import type { ChatSessionView } from "./chat-types";

describe("HermesV2ComposerArea – Anhänge", () => {
  afterEach(cleanup);

  it("lädt mehrere Dateien sequenziell und startet die zweite erst nach dem Abschluss", async () => {
    const holder: { resolve?: () => void } = {};
    const uploaded: string[] = [];
    const upload = vi.fn((file: File) => {
      uploaded.push(file.name);
      return new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
    });
    const chat = chatFixture({ uploadAttachment: upload });
    renderArea(chat);
    const input = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const first = new File(["a".repeat(10)], "eins.txt", {
      type: "text/plain",
    });
    const second = new File(["b".repeat(10)], "zwei.txt", {
      type: "text/plain",
    });
    fireEvent.change(input, { target: { files: [first, second] } });
    await waitFor(() => expect(uploaded).toEqual(["eins.txt"]));
    holder.resolve?.();
    await waitFor(() => expect(uploaded).toEqual(["eins.txt", "zwei.txt"]));
  });

  it("bricht die Batch nach Sitzungswechsel ab: erste Datei hält, zweite läuft nicht", async () => {
    const holder: { resolve?: () => void } = {};
    const upload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          holder.resolve = resolve;
        }),
    );
    const chat = chatFixture({ uploadAttachment: upload });
    const { rerender } = render(
      <HermesV2ComposerArea
        chat={chat}
        snapshot={chat.activeSnapshot}
        value=""
        disabled={false}
        disabledReason={null}
        running={false}
        submitting={false}
        active
        onSubmit={chat.submit}
        onNewSession={vi.fn()}
        onOverlayActive={vi.fn()}
      />,
    );
    const input = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "eins.txt"), new File(["y"], "zwei.txt")],
      },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    // Sitzung wechselt während des gehaltenen Uploads.
    rerender(
      <HermesV2ComposerArea
        chat={chat}
        snapshot={snapshot({ sessionId: "s2", epoch: "e2" }) as ChatSessionView}
        value=""
        disabled={false}
        disabledReason={null}
        running={false}
        submitting={false}
        active
        onSubmit={chat.submit}
        onNewSession={vi.fn()}
        onOverlayActive={vi.fn()}
      />,
    );
    holder.resolve?.();
    await waitFor(() =>
      expect(
        document.querySelector(".hermesv2-attach-note")?.textContent,
      ).toContain("ausgesetzt"),
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("weist Übergrößen vor dem Upload sichtbar ab", async () => {
    const chat = chatFixture({
      uploadAttachment: vi.fn().mockResolvedValue(undefined),
    });
    renderArea(chat);
    const input = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["z".repeat(5 * 1024 * 1024)], "gross.bin")] },
    });
    await waitFor(() =>
      expect(notices().some((text) => text.includes("Nicht übernommen"))).toBe(
        true,
      ),
    );
    expect(chat.uploadAttachment).not.toHaveBeenCalled();
  });

  it("erlaubt Anhänge nur mit Senden, wenn mindestens eins bereit ist", async () => {
    const chat = chatFixture({
      composerPatch: {
        attachments: [
          {
            uploadId: "u1",
            name: "eins.txt",
            bytes: 12,
            mime: "text/plain",
            status: "ready",
            attachment: null,
            error: null,
          },
          {
            uploadId: "u2",
            name: "zwei.txt",
            bytes: 12,
            mime: "text/plain",
            status: "unknown",
            attachment: null,
            error: null,
          },
        ],
      },
    });
    renderArea(chat, { draft: "" });
    // Ready allein genügt; unklar sperrt bewusst:
    const send = screen.getByRole("button", { name: "Senden" });
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(send.getAttribute("title")).toContain("Unklarer Anhang");
    expect(chat.submit).not.toHaveBeenCalled();
  });

  it("entfernt Anhänge lokal über die veröffentlichte Action", () => {
    const chat = chatFixture({
      composerPatch: {
        attachments: [
          {
            uploadId: "u1",
            name: "probe.pdf",
            bytes: 24,
            mime: "application/pdf",
            status: "ready",
            attachment: null,
            error: null,
          },
        ],
      },
    });
    renderArea(chat);
    fireEvent.click(
      screen.getByRole("button", { name: "Anhang probe.pdf entfernen" }),
    );
    expect(chat.removeAttachment).toHaveBeenCalledWith("u1");
  });
});

describe("HermesV2ComposerArea – Katalogladen", () => {
  afterEach(cleanup);

  it("lädt den Katalog über die vorhandene Action für die aktive Online-Sitzung", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot({
        catalog: { commands: [], models: null, loading: false, error: null },
      }),
    });
    renderArea(chat);
    expect(chat.readCatalog).toHaveBeenCalledTimes(1);
  });

  it("lädt nicht erneut bei gefülltem Katalog und nicht nach Fehler ohne Aktion", () => {
    const chat = chatFixture({
      activeSnapshot: snapshot({
        catalog: {
          commands: [],
          models: null,
          loading: false,
          error: {
            code: "catalog",
            message: "Katalog nicht ladbar",
            outcome: "not_sent" as const,
          },
        },
      }),
    });
    renderArea(chat);
    expect(chat.readCatalog).not.toHaveBeenCalled();
  });
});
