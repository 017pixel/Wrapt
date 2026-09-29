import { describe, expect, it } from "vitest";
import { commandPayloads } from "./orbitCommandPalette";

describe("Orbit-Aktionssuche", () => {
  it("bietet Notizen und Werkzeuge an, aber keine neuen Orbit-To-do-Listen", () => {
    const payloads = commandPayloads([]);
    expect(payloads.some((entry) => entry.payload.type === "note")).toBe(true);
    expect(payloads.some((entry) => entry.payload.type === "tool")).toBe(true);
    expect(payloads.some((entry) => entry.payload.type === "todo")).toBe(false);
  });
});
