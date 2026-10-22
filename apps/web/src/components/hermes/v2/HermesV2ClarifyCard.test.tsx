// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2ClarifyCard } from "./HermesV2ClarifyCard";
import type { HermesV2Request, HermesV2Response } from "./chat-types";
import { clarifyRequest } from "./request-card-fixtures";
import type { HermesV2ClarifyCardProps } from "./request-cards";

const props = (
  request: Extract<HermesV2Request, { kind: "clarify" }>,
  patch: Partial<HermesV2ClarifyCardProps> = {},
): HermesV2ClarifyCardProps => ({
  request,
  blocked: false,
  blockedReason: null,
  onRespond: vi.fn(),
  onLock: vi.fn(),
  ...patch,
});

/** noUncheckedIndexedAccess-sicherer Zugriff auf Freitextfelder der n-ten Frage. */
function freeTextAt(index: number): HTMLInputElement {
  const field = screen.getAllByLabelText("Freitext")[index];
  if (!field) throw new Error(`kein Freitextfeld ${index}`);
  return field as HTMLInputElement;
}

describe("Clarify-Karte", () => {
  afterEach(cleanup);

  it("zeigt alle echten Fragen mit Labels, Radios und Freitext neben Choices", () => {
    const request = clarifyRequest({
      questions: [
        {
          id: "q1",
          text: "Welches Ziel?",
          choices: ["Schnell", "Sauber"],
          multiple: false,
        },
        { id: "q2", text: "Warum?", choices: [], multiple: false },
      ],
    });
    render(<HermesV2ClarifyCard {...props(request)} />);
    expect(screen.getByText("Welches Ziel?")).toBeTruthy();
    expect(screen.getByText("Warum?")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("sendet die Gesamtantwort: Auswahl als String, Freitext zusätzlich zulässig", () => {
    const request = clarifyRequest({
      questions: [
        {
          id: "q1",
          text: "Welches Ziel?",
          choices: ["Schnell", "Sauber"],
          multiple: false,
        },
        { id: "q2", text: "Warum?", choices: [], multiple: false },
      ],
    });
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    render(<HermesV2ClarifyCard {...props(request, { onRespond })} />);
    fireEvent.click(screen.getByLabelText("Schnell"));
    fireEvent.change(freeTextAt(1), { target: { value: "Weil sauberer." } });
    fireEvent.click(screen.getByRole("button", { name: "Antworten senden" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "clarify",
      answers: { q1: "Schnell", q2: "Weil sauberer." },
    } satisfies HermesV2Response);
  });

  it("zeigt Freitext bei Einzelauswahl als tatsächliche Alternative zur Option", () => {
    const onRespond = vi.fn();
    render(<HermesV2ClarifyCard {...props(clarifyRequest(), { onRespond })} />);
    const option = screen.getByLabelText("Schnell") as HTMLInputElement;
    fireEvent.click(option);
    fireEvent.change(freeTextAt(0), { target: { value: "Eigene Antwort" } });
    expect(option.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Antworten senden" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "clarify",
      answers: { q1: "Eigene Antwort" },
    });
  });

  it("ersetzt Freitext sichtbar, wenn danach eine einzelne Option gewählt wird", () => {
    const onRespond = vi.fn();
    render(<HermesV2ClarifyCard {...props(clarifyRequest(), { onRespond })} />);
    fireEvent.change(freeTextAt(0), { target: { value: "Alter Entwurf" } });
    fireEvent.click(screen.getByLabelText("Sauber"));
    expect(freeTextAt(0).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Antworten senden" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "clarify",
      answers: { q1: "Sauber" },
    });
  });

  it("überträgt Multi-Auswahl als JSON.stringify(string[]) im Stringantwortfeld", () => {
    const request = clarifyRequest({
      questions: [
        { id: "m1", text: "Was beides?", choices: ["a", "b"], multiple: true },
      ],
    });
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    render(<HermesV2ClarifyCard {...props(request, { onRespond })} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole("checkbox")[1] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Antworten senden" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "clarify",
      answers: { m1: JSON.stringify(["a", "b"]) },
    } satisfies HermesV2Response);
  });

  it("sichert eine frühe Antwort je Frage über den Lock und lässt zusätzlich freitextübergreifend jederzeit Antwort sichern", () => {
    const onLock = vi.fn<(questionId: string, answer: string | null) => void>();
    render(<HermesV2ClarifyCard {...props(clarifyRequest(), { onLock })} />);
    fireEvent.click(screen.getByLabelText("Sauber"));
    fireEvent.click(screen.getByRole("button", { name: "Antwort sichern" }));
    expect(onLock).toHaveBeenCalledWith("q1", "Sauber");
  });

  it("Überspringen lockt ausdrücklich null für die Frage", () => {
    const onLock = vi.fn<(questionId: string, answer: string | null) => void>();
    render(<HermesV2ClarifyCard {...props(clarifyRequest(), { onLock })} />);
    fireEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(onLock).toHaveBeenCalledWith("q1", null);
  });

  it("bestätigte Antworten sind schreibgeschützt und fließen in die Gesamtantwort ein", () => {
    const request = clarifyRequest({
      questions: [
        {
          id: "q1",
          text: "Welches Ziel?",
          choices: ["Schnell", "Sauber"],
          multiple: false,
        },
        { id: "q2", text: "Warum?", choices: [], multiple: false },
      ],
      lockedAnswers: { q1: "Sauber" },
    });
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    render(<HermesV2ClarifyCard {...props(request, { onRespond })} />);
    expect(screen.getByText("Gesicherte Antwort: Sauber")).toBeTruthy();
    expect(screen.queryByLabelText("Schnell")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Antworten senden" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "clarify",
      answers: { q1: "Sauber", q2: null },
    } satisfies HermesV2Response);
  });

  it("gesperrte null wird als Übersprungen gezeigt ohne Antwortmöglichkeit", () => {
    render(
      <HermesV2ClarifyCard
        {...props(clarifyRequest({ lockedAnswers: { q1: null } }))}
      />,
    );
    expect(screen.getByText("Übersprungen")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Antwort sichern" }),
    ).toBeNull();
  });

  it("bewahrt offene Eingaben anderer Fragen, wenn ein neuer Snapshot dieselbe Anfrage zeigt", () => {
    const request = clarifyRequest({
      questions: [
        {
          id: "q1",
          text: "Welches Ziel?",
          choices: ["Schnell", "Sauber"],
          multiple: false,
        },
        { id: "q2", text: "Warum?", choices: [], multiple: false },
      ],
    });
    const { rerender } = render(<HermesV2ClarifyCard {...props(request)} />);
    const field = freeTextAt(1);
    fireEvent.change(field, { target: { value: "Weil wichtig." } });
    rerender(
      <HermesV2ClarifyCard {...props({ ...request, lockedAnswers: {} })} />,
    );
    expect(freeTextAt(1).value).toBe("Weil wichtig.");
  });

  it("Abbrechen sendet kind cancel ohne Antworten", () => {
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    render(<HermesV2ClarifyCard {...props(clarifyRequest(), { onRespond })} />);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "cancel" });
  });

  it("sperrt Eingaben und Aktionen mit ruhigem Grund", () => {
    render(
      <HermesV2ClarifyCard
        {...props(clarifyRequest(), {
          blocked: true,
          blockedReason: "Eine Antwort wird gerade übermittelt.",
        })}
      />,
    );
    for (const input of screen.getAllByRole("radio"))
      expect(input.hasAttribute("disabled")).toBe(true);
    for (const button of screen.getAllByRole("button"))
      expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Eine Antwort wird gerade übermittelt.",
    );
  });
});
