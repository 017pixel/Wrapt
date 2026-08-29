import { describe, expect, it } from "vitest";
import { pushEndpointSchema } from "./push.js";

describe("Push-Endpunkt-Vertrag", () => {
  it("akzeptiert sichere HTTPS-Endpunkte", () => {
    expect(pushEndpointSchema.parse("https://push.example/device")).toBe("https://push.example/device");
  });

  it.each(["http://push.example/device", "javascript:alert(1)", "//push.example/device"]) (
    "lehnt unsichere Endpunkte ab: %s",
    (endpoint) => expect(() => pushEndpointSchema.parse(endpoint)).toThrow(),
  );
});
