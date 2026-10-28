// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunsList } from "./cron-rows";
import { makeResourceFixture, readyRead } from "./resource-fixtures";
import type { HermesV2Resources } from "./resource-types";

afterEach(cleanup);

function resources(sessionId: string | null | undefined): HermesV2Resources {
  const fixture = makeResourceFixture();
  return { ...fixture, available: true, cron: { ...fixture.cron,
    runs: readyRead({ scope: "0".repeat(64), jobId: "job-1", truncated: false,
      runs: [{ id: "run-1", sessionId, startedAt: 1_800_000_000_000,
        status: "completed", text: "Ergebnis", truncated: false }] }),
  } };
}

describe("Cron-Läufe im Chat fortsetzen", () => {
  it("öffnet exakt die zugeordnete Sitzung ohne den Cronjob erneut auszuführen", () => {
    const onOpenSession = vi.fn();
    const fixture = resources("cron_job-1_20261026");
    render(<RunsList resources={fixture} onOpenSession={onOpenSession} />);
    fireEvent.click(screen.getByRole("button", { name: "Im Chat fortsetzen" }));
    expect(onOpenSession).toHaveBeenCalledExactlyOnceWith("cron_job-1_20261026");
    expect(fixture.runCron).not.toHaveBeenCalled();
    expect(fixture.createCron).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("bietet für reine Skriptausgaben ohne Sitzung (%s) keinen Chat an", (id) => {
    render(<RunsList resources={resources(id)} onOpenSession={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Im Chat fortsetzen" })).toBeNull();
  });

  it.each(["offline", "stale", "loading"])("sperrt den Einstieg für %s-Daten", (state) => {
    const fixture = resources("cron_job-1_20261026");
    if (state === "offline") fixture.available = false;
    if (state === "stale") fixture.cron.runs.stale = true;
    if (state === "loading") fixture.cron.runs.status = "loading";
    render(<RunsList resources={fixture} onOpenSession={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Im Chat fortsetzen" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
