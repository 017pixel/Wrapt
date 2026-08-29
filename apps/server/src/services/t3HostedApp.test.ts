import { describe, expect, it } from "vitest";
import type { ServiceConfig } from "../config/schemas.js";
import { resolveT3HostedAppUrl, resolveT3ServiceUrls, T3_HOSTED_APP_ORIGINS } from "./t3HostedApp.js";

describe("T3 Hosted-App", () => {
  it("wählt für jeden Kanal die passende offizielle Hosted-App", () => {
    expect(resolveT3HostedAppUrl(T3_HOSTED_APP_ORIGINS.stable, "nightly"))
      .toBe("https://nightly.app.t3.codes/");
    expect(resolveT3HostedAppUrl(T3_HOSTED_APP_ORIGINS.nightly, "stable"))
      .toBe("https://app.t3.codes/");
  });

  it("bewahrt Pfad, Query und Fragment beim Kanalwechsel", () => {
    expect(resolveT3HostedAppUrl("https://app.t3.codes/pair?host=test#token=wert", "nightly"))
      .toBe("https://nightly.app.t3.codes/pair?host=test#token=wert");
  });

  it("verändert eigene T3-Endpunkte und fehlende URLs nicht", () => {
    expect(resolveT3HostedAppUrl("https://t3.example.test/workbench", "nightly"))
      .toBe("https://t3.example.test/workbench");
    expect(resolveT3HostedAppUrl(null, "nightly")).toBeNull();
  });

  it("ändert ausschließlich den T3-Code-Service", () => {
    const services = [
      { id: "t3-code", name: "T3 Code", mode: "hybrid", publicUrl: T3_HOSTED_APP_ORIGINS.stable, check: { type: "none", reason: "Test" } },
      { id: "editor", name: "Editor", mode: "external", publicUrl: "https://editor.example.test", check: { type: "none", reason: "Test" } },
    ] satisfies ServiceConfig[];

    expect(resolveT3ServiceUrls(services, "nightly")).toEqual([
      { ...services[0], publicUrl: "https://nightly.app.t3.codes/" },
      services[1],
    ]);
  });
});
