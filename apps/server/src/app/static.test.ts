import { describe, expect, it } from "vitest";
import { t3LocalNetworkPermissionsPolicy } from "./static.js";

describe("statische Workbench-Header", () => {
  it("delegiert lokalen Netzwerkzugriff an die aufgelöste Nightly-Origin", () => {
    const policy = t3LocalNetworkPermissionsPolicy("https://nightly.app.t3.codes/thread");
    expect(policy).toBe(
      'local-network-access=(self "https://nightly.app.t3.codes"), local-network=(self "https://nightly.app.t3.codes"), loopback-network=(self "https://nightly.app.t3.codes")',
    );
    expect(policy).not.toContain('"https://app.t3.codes"');
  });

  it("fällt ohne externen T3-Client auf die Workbench-Origin zurück", () => {
    expect(t3LocalNetworkPermissionsPolicy(null))
      .toBe("local-network-access=(self), local-network=(self), loopback-network=(self)");
  });
});
