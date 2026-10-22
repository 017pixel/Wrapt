// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HermesV2CronDetail, HermesV2CronRuns } from "@wrapt/contracts/hermes-v2";
import { HermesV2CronArea } from "./HermesV2CronArea";
import { cronJob, cronList } from "./resource-cron-fixtures";
import {
  actionView,
  errorRead,
  idleRead,
  makeResourceFixture,
  readyRead,
} from "./resource-fixtures";

const job = cronJob();
const detail = { scope: "0".repeat(64), job } as HermesV2CronDetail;

function renderArea(overrides: Parameters<typeof makeResourceFixture>[0]) {
  return render(<HermesV2CronArea resources={makeResourceFixture(overrides)} />);
}

afterEach(cleanup);

describe("HermesV2CronArea", () => {
  it("baut Jobs, Details und Läufe als Abschnitte einer Verwaltungsseite", () => {
    renderArea({
      cron: { list: readyRead(cronList([job])), selectedId: null, detail: idleRead(), runs: idleRead() },
    });
    expect(screen.getByRole("region", { name: "Cron" }).getAttribute("data-hermes-area")).toBe("cron");
    expect(screen.getByRole("region", { name: "Jobs" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cron-Läufe" })).toBeTruthy();
  });

  it("unterscheidet idle, leer, native Liste gekürzt und Fehler", () => {
    renderArea({});
    expect(screen.getByText("Cron-Jobs noch nicht geladen.")).toBeTruthy();
    cleanup();
    renderArea({
      cron: { list: readyRead(cronList([])), selectedId: null, detail: idleRead(), runs: idleRead() },
    });
    expect(screen.getByText("Keine Cron-Jobs.")).toBeTruthy();
    cleanup();
    renderArea({
      cron: {
        list: errorRead({ code: "RESOURCE_UNAVAILABLE", message: "Cron-Liste ließ sich nativ nicht belegen.", outcome: "not_sent" }),
        selectedId: null,
        detail: idleRead(),
        runs: idleRead(),
      },
    });
    expect(screen.getByText("Cron-Liste ließ sich nativ nicht belegen.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Cron aktualisieren" }).length).toBeGreaterThan(0);
    cleanup();
    renderArea({
      cron: {
        list: readyRead(cronList([job], true)),
        selectedId: null,
        detail: idleRead(),
        runs: idleRead(),
      },
    });
    expect(screen.getByText(/Liste gekürzt/)).toBeTruthy();
  });

  it("benennt echte Zeilen zugänglich Cron-Job: <Name> und bindet die Kennung", () => {
    renderArea({
      cron: { list: readyRead(cronList([job])), selectedId: null, detail: idleRead(), runs: idleRead() },
    });
    const row = screen.getByRole("button", { name: "Cron-Job: Nächtliche Zusammenfassung" });
    expect(row.getAttribute("data-hermes-cron-job")).toBe("job-1");
  });

  it("öffnet Ausführen mit konkreter Zielbindung und bezeichnet die Pausenfolge", async () => {
    renderArea({
      cron: {
        list: readyRead(cronList([job])),
        selectedId: "job-1",
        detail: readyRead(detail),
        runs: idleRead(),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cron-Job ausführen: Nächtliche Zusammenfassung" }));
    const dialog = screen.getByRole("dialog", { name: "Cron-Job ausführen" });
    expect(dialog.textContent).toContain("job-1");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Pausierter Job: die mögliche Aktivierung steht vor dem Senden konkret.
    cleanup();
    const pausedJob = { ...job, paused: true };
    renderArea({
      cron: {
        list: readyRead(cronList([job])),
        selectedId: "job-1",
        detail: readyRead({ scope: "0".repeat(64), job: pausedJob }),
        runs: idleRead(),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cron-Job ausführen: Nächtliche Zusammenfassung" }));
    expect(screen.getByRole("dialog", { name: "Cron-Job ausführen" }).textContent).toContain("ist pausiert");
  });

  it("zeigt terminale Aktionen ehrlich und unknown bietet bewusstes Neulesen", () => {
    renderArea({
      cron: {
        list: readyRead(cronList([job])),
        selectedId: "job-1",
        detail: readyRead(detail),
        runs: idleRead(),
      },
      actions: [
        actionView({
          key: "a-run",
          operation: "cron.run",
          targetId: "job-1",
          status: "unknown",
          error: { code: "UNKNOWN_OUTCOME", message: "Native Trigger-Antwort ging verloren.", outcome: "unknown", status: null, retryable: false },
        }),
      ],
    });
    const region = screen.getAllByRole("list", { name: "Cron-Aktionen" }).at(-1) as HTMLElement;
    expect(region.textContent).toContain("unbekannt: Native Trigger-Antwort ging verloren.");
    fireEvent.click(screen.getByRole("button", { name: "Bewusst neu lesen" }));
  });

  it("ohne ausgewählten Job gibt es keinen Ausführungsknopf", () => {
    renderArea({
      cron: { list: readyRead(cronList([job])), selectedId: null, detail: readyRead(detail), runs: idleRead() },
    });
    expect(screen.queryAllByRole("button", { name: "Ausführen" }).length).toBe(0);
  });

  it("rendert Runs mit Zeit, Status und ehrlichem Kürzungshinweis", () => {
    const runs = {
      scope: "0".repeat(64),
      jobId: "job-1",
      runs: [{ id: "r-1", startedAt: 1760000000000, status: "ok", text: "Lief.", truncated: true }],
      truncated: false,
    } as HermesV2CronRuns;
    renderArea({
      cron: {
        list: readyRead(cronList([job])),
        selectedId: "job-1",
        detail: readyRead(detail),
        runs: readyRead(runs),
      },
    });
    expect(screen.getByText(/Status ok/)).toBeTruthy();
    expect(screen.getByText(/Ausgabe gekürzt/)).toBeTruthy();
  });

  it("unbekannter Create bleibt mit einem Reconcileweg unabhängig von der Jobauswahl.", () => {
    const reconcileAction = vi.fn().mockResolvedValue(undefined);
    renderArea({
      cron: {
        list: readyRead(cronList([job])),
        selectedId: "job-1",
        detail: readyRead(detail),
        runs: idleRead(),
      },
      actions: [
        actionView({ key: "run-ack", operation: "cron.run", targetId: "job-1", status: "confirmed" }),
        actionView({
          key: "create-unknown",
          operation: "cron.create",
          targetId: null,
          status: "unknown",
          error: { code: "UNKNOWN_OUTCOME", message: "Create-Antwort ging nativ verloren.", outcome: "unknown", status: null, retryable: false },
        }),
      ],
      reconcileAction,
    } as never);
    const region = screen.getAllByRole("list", { name: "Cron-Aktionen" }).at(-1) as HTMLElement;
    expect(region.textContent).toContain("bestätigt mit nativer Quittung");
    expect(region.textContent).toContain("Create-Antwort ging nativ verloren.");
    fireEvent.click(screen.getByRole("button", { name: "Bewusst neu lesen" }));
    expect(reconcileAction).toHaveBeenCalledWith("create-unknown");
  });
});
