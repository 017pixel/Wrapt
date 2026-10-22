// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2SecretCard } from "./HermesV2SecretCard";
import type { HermesV2Request, HermesV2Response } from "./chat-types";
import { secretRequest } from "./request-card-fixtures";
import type { HermesV2SecretCardProps } from "./request-cards";

function secretProps(
  request: Extract<HermesV2Request, { kind: "secret" }>,
  onRespond: (response: HermesV2Response) => void | Promise<void>,
  patch: Partial<Omit<HermesV2SecretCardProps, "onRespond">> = {},
): HermesV2SecretCardProps {
  return {
    request,
    blocked: false,
    blockedReason: null,
    onLock: vi.fn(),
    onRespond,
    ...patch,
  };
}

const setPasswordControl = (container: HTMLElement, value: string) => {
  const input = container.querySelector<HTMLInputElement>(
    "input[type='password']",
  );
  if (!input) throw new Error("kein Passwortfeld");
  fireEvent.change(input, { target: { value } });
};

describe("Secret-Karte", () => {
  afterEach(cleanup);

  it("maskiert die Eingabe im echten DOM", () => {
    const { container } = render(
      <HermesV2SecretCard {...secretProps(secretRequest(), vi.fn())} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      "input[type='password']",
    );
    if (!input) throw new Error("kein Passwortfeld");
    fireEvent.change(input, { target: { value: "s3cret" } });
    expect(input.value).toBe("s3cret");
    expect(input.getAttribute("type")).toBe("password");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(container.textContent).not.toContain("s3cret");
  });

  it("liest den Wert synchron und leert das DOM sofort vor einem ausstehenden Promise", async () => {
    const deferred: { resolve: () => void } = { resolve: () => undefined };
    const onRespond = vi.fn<(response: HermesV2Response) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    const { container } = render(
      <HermesV2SecretCard {...secretProps(secretRequest(), onRespond)} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "klartsicher" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(input.value).toBe(""); // synchron, vor dem ersten Await
    expect(onRespond).toHaveBeenCalledWith({
      kind: "secret",
      value: "klartsicher",
    });
    deferred.resolve();
    await waitFor(() => expect(password()).toBe("")); // bleibt leer auch nach Abchluss
  });

  const password = (): string =>
    document.querySelector<HTMLInputElement>("input[type='password']")?.value ??
    "";

  it("leert auch bei gesperrter Karte, Unmount und versteckter Fläche", () => {
    const onRespond = vi.fn<(response: HermesV2Response) => Promise<void>>(
      () => new Promise<void>(() => undefined),
    );
    const { container, unmount } = render(
      <HermesV2SecretCard {...secretProps(secretRequest(), onRespond)} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bleiben" } });
    unmount();
    expect(input.value).toBe("");
  });

  it("Überspringen sendet den belegten leeren Wert", () => {
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    const { container } = render(
      <HermesV2SecretCard {...secretProps(secretRequest(), onRespond)} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bleibt-leer" } });
    fireEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "secret", value: "" });
    expect(input.value).toBe("");
  });

  it("vault.save_login übermittelt Kennung und Passwort ausschließlich als JSON.stringify", () => {
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    render(
      <HermesV2SecretCard
        {...secretProps(
          secretRequest({
            method: "vault.save_login",
            label: "Login speichern",
          }),
          onRespond,
        )}
      />,
    );
    fireEvent.change(screen.getByLabelText("Kennung"), {
      target: { value: "benutzer" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), {
      target: { value: "passwort123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(onRespond).toHaveBeenCalledWith({
      kind: "secret",
      value: JSON.stringify({
        identifier: "benutzer",
        password: "passwort123",
      }),
    });
  });

  it("ehrt die ehrliche Wirelänge mit sozialem Fehler statt Kürzung", () => {
    const onRespond = vi.fn<(response: HermesV2Response) => void>();
    const { container } = render(
      <HermesV2SecretCard {...secretProps(secretRequest(), onRespond)} />,
    );
    setPasswordControl(container, "x".repeat(65_537));
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Die Eingabe ist zu lang.",
    );
    expect(
      (container.querySelector("input[type='password']") as HTMLInputElement)
        .value,
    ).toBe("");
  });
});
