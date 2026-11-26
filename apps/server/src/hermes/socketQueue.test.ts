import { expect, it } from "vitest";
import { createOrderedMessageHandler } from "./socketQueue.js";

it("verarbeitet Socket-Nachrichten strikt in Empfangsreihenfolge", async () => {
  const seen: string[] = [];
  let release: (() => void) | null = null;
  const handle = createOrderedMessageHandler(async (raw) => {
    const value = String(raw);
    if (value === "attach") await new Promise<void>((resolve) => { release = resolve; });
    seen.push(value);
  });
  handle("attach");
  handle("send");
  handle("cancel");
  await Promise.resolve();
  expect(seen).toEqual([]);
  release!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seen).toEqual(["attach", "send", "cancel"]);
});

it("verarbeitet nach einem Fehler weiter", async () => {
  const seen: string[] = [];
  const handle = createOrderedMessageHandler(async (raw) => {
    if (raw === "kaputt") throw new Error("kaputt");
    seen.push(String(raw));
  });
  handle("kaputt");
  handle("weiter");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seen).toEqual(["weiter"]);
});
