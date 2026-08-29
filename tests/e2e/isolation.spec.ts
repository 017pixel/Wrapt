import { test, expect } from "@playwright/test";

const origin = (process.env.WRAPT_E2E_URL ?? `http://127.0.0.1:${process.env.WRAPT_E2E_PORT ?? "3010"}`).replace(/\/$/, "");
const identity = process.env.WRAPT_E2E_USER ?? "user@example.com";

test.describe("E2E-Isolation", () => {
  test("sieht nur die eigene Portpalette und liefert Registry-Backup-Metriken", async ({ request }) => {
    test.skip(Boolean(process.env.WRAPT_E2E_URL), "Der Isolationstest gilt für den vom Launcher gestarteten Server.");
    const e2ePort = Number(process.env.WRAPT_E2E_PORT ?? "3010");
    const allowedPorts = new Set(Array.from({ length: 10 }, (_, index) => e2ePort + 30 + index));
    const headers = { "tailscale-user-login": identity };
    const portsResponse = await request.get(`${origin}/api/v1/local-ports`, { headers });
    expect(portsResponse.ok()).toBe(true);
    const ports = (await portsResponse.json()) as { ports: Array<{ port: number }> };
    expect(ports.ports.every((entry) => allowedPorts.has(entry.port))).toBe(true);

    const metricsResponse = await request.get(`${origin}/api/v1/system/operational-metrics`, { headers });
    expect(metricsResponse.ok()).toBe(true);
    const metrics = await metricsResponse.json() as {
      websocket: { bridges: Array<{ label: string }> };
      extensions: { backup: { available: boolean; lastError: string | null } };
    };
    expect(metrics.websocket.bridges.map((bridge) => bridge.label)).toEqual(expect.any(Array));
    expect(metrics.extensions.backup.lastError).toBeNull();
  });
});
