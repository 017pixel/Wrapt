// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ConfirmDialog } from "./ModalDialog";

/**
 * Muster aus e2e/negative.spec.ts („Doppelklick und Absenden während
 * Theme-Speichern erzeugen nur eine Mutation"), übertragen auf den generischen
 * ConfirmDialog: Zwei schnelle Bestätigungen → genau eine Mutation, danach ist
 * der Knopf per confirmPending disabled und zeigt einen Spinner.
 */
function GeloeschterDialog({ laeuft, onBestaetigt }: { laeuft: (fertig: () => void) => void; onBestaetigt: () => void }) {
  const [pending, setPending] = useState(false);
  const [offen, setOffen] = useState(true);
  return (
    <ConfirmDialog
      open={offen}
      title="Wirklich löschen?"
      description="Der Eintrag wird dauerhaft entfernt."
      confirmLabel={pending ? "Wird gelöscht …" : "Endgültig löschen"}
      danger
      confirmPending={pending}
      onConfirm={() => {
        setPending(true);
        laeuft(() => {
          onBestaetigt();
        });
      }}
      onClose={() => setOffen(false)}
    />
  );
}

describe("ConfirmDialog", () => {
  afterEach(cleanup);

  it("bleibt nach Hintergrundarbeit im geschlossenen Zustand bestätigbar", () => {
    const onConfirm = vi.fn();
    const props = { title: "Code-Plugin vertrauen?", description: "Eigenen Code aktivieren.", confirmLabel: "Aktivieren", onConfirm, onClose: vi.fn() };
    const view = render(<ConfirmDialog {...props} open={false} confirmPending={false} />);
    view.rerender(<ConfirmDialog {...props} open={false} confirmPending />);
    view.rerender(<ConfirmDialog {...props} open={false} confirmPending={false} />);
    view.rerender(<ConfirmDialog {...props} open confirmPending={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktivieren" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("lässt nach einem fehlgeschlagenen Auftrag eine erneute Bestätigung zu", () => {
    const onConfirm = vi.fn();
    const props = { open: true, title: "Löschen?", description: "Eintrag löschen.", confirmLabel: "Löschen", onConfirm, onClose: vi.fn() };
    const view = render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    view.rerender(<ConfirmDialog {...props} confirmPending />);
    view.rerender(<ConfirmDialog {...props} confirmPending={false} error="Fehlgeschlagen" />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("Doppelklick löst nur eine Mutation aus und verriegelt danach", () => {
    const mutation = vi.fn();
    let fertig!: () => void;
    render(<GeloeschterDialog onBestaetigt={mutation} laeuft={(done) => { fertig = done; }} />);

    const knopf = screen.getByRole("button", { name: "Endgültig löschen" });
    fireEvent.click(knopf);
    // Zweiter Klick vor dem nächsten Render (Doppelklick): wird verriegelt.
    fireEvent.click(knopf);
    expect(mutation).not.toHaveBeenCalled();
    fertig();
    expect(mutation).toHaveBeenCalledTimes(1);

    // Während pending: disabled + Spinner, kein zweiter Aufruf möglich.
    const pendingKnopf = screen.getByRole("button", { name: "Wird gelöscht …" });
    expect(pendingKnopf.hasAttribute("disabled")).toBe(true);
    expect(pendingKnopf.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(pendingKnopf);
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("hält Fehler im Dialog statt zu schließen", () => {
    const mutation = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Wirklich löschen?"
        description="Der Eintrag wird dauerhaft entfernt."
        confirmLabel="Löschen"
        danger
        error="Löschen fehlgeschlagen."
        onConfirm={mutation}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Löschen fehlgeschlagen.")).toBeTruthy();
    // Dialog bleibt offen: Abbrechen ist weiter möglich.
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeTruthy();
  });
});
