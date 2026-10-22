// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2ApprovalCard } from "./HermesV2ApprovalCard";
import type { HermesV2Response } from "./chat-types";
import { approvalRequest, respondCapture } from "./request-card-fixtures";

describe("Approval-Karte", () => {
  afterEach(cleanup);

  it("zeigt Beschreibung und Command, aber ausschließlich tatsächlich angebotene choices", () => {
    const { values, onRespond } = respondCapture();
    render(
      <HermesV2ApprovalCard
        request={approvalRequest({ choices: ["once", "deny"] })}
        blocked={false}
        blockedReason={null}
        onLock={vi.fn()}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("Einmal erlauben")).toBeTruthy();
    expect(screen.getByText("Ablehnen")).toBeTruthy();
    expect(screen.queryByText("Für Sitzung erlauben")).toBeNull();
    expect(screen.queryByText("Dauerhaft erlauben")).toBeNull();
    expect(document.querySelector("pre")?.textContent).toBe(
      "sudo rm -rf /tmp/x",
    );
    expect(screen.getByRole("article").textContent).toContain(
      "Dateilöschung im Projekt",
    );
    fireEvent.click(screen.getByText("Einmal erlauben"));
    expect(values).toEqual([
      { kind: "approval", choice: "once" } satisfies HermesV2Response,
    ]);
  });

  it("beschriftet die dauerhafte Entscheidung als dauerhaft", () => {
    render(
      <HermesV2ApprovalCard
        request={approvalRequest({ choices: ["always", "deny"] })}
        blocked={false}
        blockedReason={null}
        onLock={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText("Dauerhaft erlauben")).toBeTruthy();
    expect(
      screen.getByTitle(
        "Diese Entscheidung bleibt auch für künftige Anfragen dieser Art bestehen.",
      ),
    ).toBeTruthy();
  });

  it("sendet deny verlässlich", () => {
    const { values, onRespond } = respondCapture();
    render(
      <HermesV2ApprovalCard
        request={approvalRequest()}
        blocked={false}
        blockedReason={null}
        onLock={vi.fn()}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByText("Ablehnen"));
    expect(values).toEqual([{ kind: "approval", choice: "deny" }]);
  });

  it("sperrt alle Aktionen bei framesünde mit ruhigem Grund", () => {
    render(
      <HermesV2ApprovalCard
        request={approvalRequest()}
        blocked
        blockedReason="Keine Verbindung zu Hermes."
        onLock={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(4);
    for (const button of buttons)
      expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Keine Verbindung zu Hermes.",
    );
  });
});
