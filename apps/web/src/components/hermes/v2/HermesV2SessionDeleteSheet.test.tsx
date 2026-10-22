// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HermesV2SessionDeletionPreview } from "@wrapt/contracts/hermes-v2";
import { HermesV2SessionDeleteSheet } from "./HermesV2SessionDeleteSheet";
import { actionView, errorRead, makeResourceFixture, missingRead, readyRead } from "./resource-fixtures";

afterEach(cleanup);

const preview: HermesV2SessionDeletionPreview = {
  scope: "0".repeat(64),
  requestedSessionId: "ordner/sitzung-42",
  title: "Sitzung 42",
  deletable: true,
  reason: null,
  effect: "compression-chain",
};

describe("HermesV2SessionDeleteSheet", () => {
  it("bindet die exakte Kennung und erklärt Kette samt Unteraufgaben", () => {
    const fixture = makeResourceFixture({
      sessionDeletion: readyRead(preview),
    } as never);
    render(
      <HermesV2SessionDeleteSheet
        resources={fixture}
        sessionId="ordner/sitzung-42"
        onClose={() => undefined}
      />,
    );
    expect(
      screen.getByText("Sitzung löschen: Sitzung 42"),
    ).toBeTruthy();
    expect(document.querySelector("[data-hermes-delete-session='ordner/sitzung-42']")).toBeTruthy();
    expect(screen.getByText(/Kompressionskette/)).toBeTruthy();
    expect(screen.getByText(/delegierten Unteraufgaben/)).toBeTruthy();
    expect(screen.getByText(/Branch- und Resetgespräche bleiben erhalten/)).toBeTruthy();
  });

  it("Abbrechen sendet nichts; Auswahlkulanz bleibt an der Fläche", () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const fixture = makeResourceFixture({
      sessionDeletion: readyRead(preview),
      deleteSession,
    } as never);
    render(
      <HermesV2SessionDeleteSheet resources={fixture} sessionId="ordner/sitzung-42" onClose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(deleteSession).not.toHaveBeenCalled();
    expect(screen.queryByText("Löschung nativ bestätigt.")).toBeNull();
  });

  it("409 bleibt sichtbar; der Katalog behält die Zeile", () => {
    const fixture = makeResourceFixture({
      sessionDeletion: readyRead(preview),
      actions: [
        actionView({
          key: "a-del",
          operation: "session.delete",
          targetId: "ordner/sitzung-42",
          status: "rejected",
          error: { code: "NATIVE_CONFLICT", message: "Native Sitzung ist noch aktiv.", outcome: "rejected", status: 409, retryable: false },
        }),
      ],
    } as never);
    render(
      <HermesV2SessionDeleteSheet resources={fixture} sessionId="ordner/sitzung-42" onClose={() => undefined} />,
    );
    expect(screen.getByText(/Native Sitzung ist noch aktiv\./)).toBeTruthy();
    expect(screen.getByText(/Der Vorgang wurde abgelehnt\./)).toBeTruthy();
    expect(screen.queryByText("Löschung nativ bestätigt.")).toBeNull();
  });

  it("unknown sperrt einen erneuten Versuch bis bewusstem Neulesen", () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const fixture = makeResourceFixture({
      sessionDeletion: readyRead(preview),
      deleteSession,
      actions: [
        actionView({
          key: "a-del",
          operation: "session.delete",
          targetId: "ordner/sitzung-42",
          status: "unknown",
          error: { code: "UNKNOWN_OUTCOME", message: "Native Antwort blieb aus.", outcome: "unknown", status: null, retryable: false },
        }),
      ],
    } as never);
    render(
      <HermesV2SessionDeleteSheet resources={fixture} sessionId="ordner/sitzung-42" onClose={() => undefined} />,
    );
    expect(screen.getByText(/blieb aus\./)).toBeTruthy();
    expect(screen.getByText(/Ausgang unklar/)).toBeTruthy();
    expect(screen.getByText("Bewusst neu lesen")).toBeTruthy();
    const confirmButton = screen.getByRole("button", { name: "Sitzung löschen" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("gesperrter Löschfall zeigt den nativen Grund, sendet nichts", () => {
    const fixture = makeResourceFixture({
      sessionDeletion: readyRead({
        ...preview,
        deletable: false,
        reason: "Sitzung läuft nativ noch.",
      }),
    } as never);
    render(
      <HermesV2SessionDeleteSheet resources={fixture} sessionId="ordner/sitzung-42" onClose={() => undefined} />,
    );
    expect(screen.getByText(/Sitzung läuft nativ noch\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sitzung löschen" })).toBeNull();
  });

  it("Unbestätigte Quelle liet uns nichts senden und bleibt offen.", () => {
    const fixture = makeResourceFixture({
      sessionDeletion: errorRead({ code: "SOURCE_IDENTITY_UNKNOWN", message: "Quellprofil nicht bestätigt.", outcome: "not_sent" }),
    } as never);
    render(
      <HermesV2SessionDeleteSheet resources={fixture} sessionId="ordner/sitzung-42" onClose={() => undefined} />,
    );
    expect(screen.getByText("Quellprofil nicht bestätigt.")).toBeTruthy();
  });

  it("bestätigte Löschung bleibt mit Fertig sichtbar, wenn die Vorschau später 404/missing ist", () => {
    const fixture = makeResourceFixture({
      sessionDeletion: readyRead(preview),
      actions: [
        actionView({
          key: "del-ack",
          operation: "session.delete",
          targetId: "ordner/sitzung-42",
          status: "confirmed",
        }),
      ],
    } as never);
    const view = render(
      <HermesV2SessionDeleteSheet
        resources={fixture}
        sessionId="ordner/sitzung-42"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/Löschung nativ bestätigt\./)).toBeTruthy();
    // Vorschau wird später fresh auf die abwesende ID gelesen: kein
    // widersprüchlicher Sperrtext, Receipt und Fertig bleiben sichtbar.
    fixture.sessionDeletion = missingRead();
    view.rerender(
      <HermesV2SessionDeleteSheet
        resources={fixture}
        sessionId="ordner/sitzung-42"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/Löschung nativ bestätigt\./)).toBeTruthy();
    expect(screen.getByText("Fertig")).toBeTruthy();
    expect(screen.queryByText(/Löschen ist nativ gesperrt/)).toBeNull();
  });
});

/** Verbleibende Lücken: Idle-Vorschau und deren Leerreinigung. */
