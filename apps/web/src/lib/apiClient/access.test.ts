import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { request } from "./transport";
import { workbenchAccess } from "../workbenchAccess";

afterEach(() => { workbenchAccess.reset(); vi.unstubAllGlobals(); });

describe("Workbench-Zugriff", () => {
  it("stoppt Anfragen nach einem 401 bis zur bewussten erneuten Prüfung", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(request("/projects", z.unknown())).rejects.toMatchObject({ status: 401 });
    await expect(request("/notes", z.unknown())).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
    workbenchAccess.reset();
    fetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await request("/projects", z.unknown());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("sperrt bei fehlenden Adminrechten nur den betroffenen Bereich", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "WRAPT_ADMIN_REQUIRED", message: "Admin erforderlich", retryable: false } }), { status: 403 })));
    await expect(request("/extensions", z.unknown())).rejects.toMatchObject({ status: 403 });
    expect(workbenchAccess.getSnapshot()).toBeNull();
  });
});
