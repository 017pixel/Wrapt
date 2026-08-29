import { describe, expect, it } from "vitest";
import { isLoopbackHost } from "./loopback.js";

describe("Loopback-Listener-Grenze", () => {
  it("akzeptiert nur die explizit erlaubten Loopback-Namen", () => {
    expect(isLoopbackHost("  LOCALHOST ")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("127.0.0.2")).toBe(false);
    expect(isLoopbackHost("workbench.example")).toBe(false);
  });
});
