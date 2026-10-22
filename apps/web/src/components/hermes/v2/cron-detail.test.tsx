// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HermesV2CronArea } from "./HermesV2CronArea";
import { TargetActions } from "./cron-detail";
import { cronJob, cronList } from "./resource-cron-fixtures";
import {
  actionView,
  idleRead,
  makeResourceFixture,
  missingRead,
  readyRead,
} from "./resource-fixtures";

const job = cronJob();
const confirmedToggles = [
  actionView({ key: "resume-1", operation: "cron.resume", targetId: job.id, status: "confirmed" }),
  actionView({ key: "pause-2", operation: "cron.pause", targetId: job.id, status: "confirmed" }),
  actionView({ key: "resume-3", operation: "cron.resume", targetId: job.id, status: "confirmed" }),
];
const confirmedToggleText = [
  "Fortsetzen: bestätigt mit nativer Quittung",
  "Pausieren: bestätigt mit nativer Quittung",
  "Fortsetzen: bestätigt mit nativer Quittung",
];

function visibleActions() {
  const list = screen.getByRole("list", { name: "Cron-Aktionen" });
  return within(list).getAllByRole("listitem").map((row) => row.textContent);
}

afterEach(cleanup);

describe("TargetActions", () => {
  it("hält Unknown-Create nach drei bestätigten Jobaktionen in der Area abgleichbar", () => {
    const unknown = actionView({
      key: "create-unknown",
      status: "unknown",
      error: {
        code: "UNKNOWN_OUTCOME",
        message: "Native Create-Antwort fehlt.",
        outcome: "unknown",
        status: null,
        retryable: false,
      },
    });
    const resources = makeResourceFixture({
      cron: {
        list: readyRead(cronList([job])),
        selectedId: job.id,
        detail: readyRead({ scope: "0".repeat(64), job }),
        runs: idleRead(),
      },
      actions: [unknown],
    });
    const view = render(<HermesV2CronArea resources={resources} />);
    expect(screen.getByText("Erstellen: unbekannt: Native Create-Antwort fehlt.")).toBeTruthy();

    view.rerender(<HermesV2CronArea resources={{
      ...resources,
      actions: [unknown, ...confirmedToggles],
    }} />);

    expect(visibleActions()).toEqual([
      "Erstellen: unbekannt: Native Create-Antwort fehlt.Bewusst neu lesen",
      ...confirmedToggleText,
    ]);
    expect(resources.reconcileAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bewusst neu lesen" }));
    expect(resources.reconcileAction).toHaveBeenCalledExactlyOnceWith("create-unknown");
    expect(resources.createCron).not.toHaveBeenCalled();
    expect(resources.pauseCron).not.toHaveBeenCalled();
    expect(resources.resumeCron).not.toHaveBeenCalled();
    expect(resources.runCron).not.toHaveBeenCalled();
    expect(resources.deleteCron).not.toHaveBeenCalled();
  });

  describe.each([
    ["cron.create", "Erstellen", null],
    ["cron.update", "Änderung", job.id],
    ["cron.pause", "Pausieren", job.id],
    ["cron.resume", "Fortsetzen", job.id],
    ["cron.run", "Ausführen", job.id],
    ["cron.delete", "Löschen", job.id],
  ] as const)("offene Aktion %s", (operation, label, targetId) => {
    it.each(["pending", "unknown"] as const)("bleibt bei %s vor neueren Quittungen erreichbar", (status) => {
      const resources = makeResourceFixture({ actions: [
        actionView({ key: "open-action", operation, targetId, status }),
        ...confirmedToggles,
      ] });
      render(<TargetActions resources={resources} jobId={job.id} />);
      expect(visibleActions()).toEqual([
        status === "pending"
          ? `${label}: läuft…`
          : `${label}: unbekannt: Bewusst neu lesen`,
        ...confirmedToggleText,
      ]);
      expect(resources.reconcileAction).not.toHaveBeenCalled();
      if (status === "unknown") {
        fireEvent.click(screen.getByRole("button", { name: "Bewusst neu lesen" }));
        expect(resources.reconcileAction).toHaveBeenCalledExactlyOnceWith("open-action");
      } else {
        expect(screen.queryByRole("button", { name: "Bewusst neu lesen" })).toBeNull();
      }
    });
  });

  it("behält alle offenen Aktionen und die drei letzten Quittungen in Originalreihenfolge", () => {
    const actions = Object.freeze([
      actionView({ key: "old", operation: "cron.update", targetId: job.id, status: "confirmed" }),
      actionView({ key: "pending-create", status: "pending", reconciled: true }),
      confirmedToggles[0]!,
      actionView({ key: "unknown-update", operation: "cron.update", targetId: job.id, status: "unknown" }),
      confirmedToggles[1]!,
      actionView({ key: "pending-run", operation: "cron.run", targetId: job.id }),
      actionView({ key: "unknown-delete", operation: "cron.delete", targetId: job.id, status: "unknown" }),
      confirmedToggles[2]!,
      actionView({ key: "pending-pause", operation: "cron.pause", targetId: job.id }),
    ].map((action) => Object.freeze(action)));
    render(<TargetActions resources={makeResourceFixture({ actions })} jobId={job.id} />);
    expect(visibleActions()).toEqual([
      "Erstellen: läuft…",
      confirmedToggleText[0],
      "Änderung: unbekannt: Bewusst neu lesen",
      confirmedToggleText[1],
      "Ausführen: läuft…",
      "Löschen: unbekannt: Bewusst neu lesen",
      confirmedToggleText[2],
      "Pausieren: läuft…",
    ]);
    expect(screen.getAllByRole("button", { name: "Bewusst neu lesen" })).toHaveLength(2);
  });

  it.each(["confirmed", "not_sent", "rejected", "unknown"] as const)(
    "begrenzt ältere terminale %s-Aktionen einschließlich abgeglichenem Unknown",
    (status) => {
      const resources = makeResourceFixture({ actions: [
        actionView({ key: "old", operation: "cron.update", targetId: job.id, status, reconciled: true }),
        ...confirmedToggles,
      ] });
      render(<TargetActions resources={resources} jobId={job.id} />);
      expect(visibleActions()).toEqual(confirmedToggleText);
      expect(screen.queryByRole("button", { name: "Bewusst neu lesen" })).toBeNull();
    },
  );

  it("zählt nicht gesendete, abgelehnte und abgeglichene Unknown-Aktionen zum Quittungslimit", () => {
    const resources = makeResourceFixture({ actions: [
      ...confirmedToggles,
      actionView({ key: "not-sent", operation: "cron.update", targetId: job.id, status: "not_sent" }),
      actionView({ key: "rejected", operation: "cron.run", targetId: job.id, status: "rejected" }),
      actionView({ key: "reconciled", operation: "cron.delete", targetId: job.id, status: "unknown", reconciled: true }),
    ] });
    render(<TargetActions resources={resources} jobId={job.id} />);
    expect(visibleActions()).toEqual([
      "Änderung: nicht gesendet: ",
      "Ausführen: abgelehnt: ",
      "Löschen: unbekannt: Bewusst neu lesen",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Bewusst neu lesen" }));
    expect(resources.reconcileAction).toHaveBeenCalledExactlyOnceWith("reconciled");
  });

  it("nimmt Unknown erst nach dem vom Client bestätigten Abgleich in das Quittungslimit auf", () => {
    const unknown = actionView({ key: "unknown", status: "unknown" });
    const resources = makeResourceFixture({ actions: [unknown, ...confirmedToggles] });
    const view = render(<TargetActions resources={resources} jobId={job.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Bewusst neu lesen" }));
    expect(visibleActions()).toHaveLength(4);
    view.rerender(<TargetActions resources={{
      ...resources,
      actions: [{ ...unknown, reconciled: true }, ...confirmedToggles],
    }} jobId={job.id} />);
    expect(visibleActions()).toEqual(confirmedToggleText);
    expect(resources.reconcileAction).toHaveBeenCalledExactlyOnceWith("unknown");
    expect(resources.createCron).not.toHaveBeenCalled();
  });

  it.each([job.id, "job-10", null])("bindet offene Aktionen und Creates exakt an Auswahl %s", (jobId) => {
    const resources = makeResourceFixture({ actions: [
      actionView({ key: "null-create", status: "unknown" }),
      actionView({ key: "own-update", operation: "cron.update", targetId: job.id, status: "unknown" }),
      actionView({ key: "own-create", targetId: job.id, status: "confirmed" }),
      actionView({ key: "other-delete", operation: "cron.delete", targetId: "job-10" }),
      actionView({ key: "null-update", operation: "cron.update", status: "unknown" }),
      actionView({ key: "null-session", operation: "session.delete", status: "unknown" }),
      ...confirmedToggles,
    ] });
    const view = render(<TargetActions resources={resources} jobId={jobId} />);
    const nullCreateText = "Erstellen: unbekannt: Bewusst neu lesen";
    expect(visibleActions()).toEqual(jobId === job.id ? [
      nullCreateText,
      "Änderung: unbekannt: Bewusst neu lesen",
      ...confirmedToggleText,
    ] : jobId === "job-10" ? [nullCreateText, "Löschen: läuft…"] : [nullCreateText]);
    view.rerender(<TargetActions resources={makeResourceFixture({ actions: [
      actionView({ key: "bound-create", targetId: job.id, status: "confirmed" }),
    ] })} jobId={jobId} />);
    if (jobId === job.id) {
      expect(visibleActions()).toEqual(["Erstellen: bestätigt mit nativer Quittung"]);
    } else {
      expect(screen.queryByRole("list", { name: "Cron-Aktionen" })).toBeNull();
    }
  });

  it.each(["cron.run", "cron.delete"] as const)("erhält %s-Quittungen bei anschließend fehlendem Job", (operation) => {
    const resources = makeResourceFixture({
      cron: {
        list: readyRead(cronList([])),
        selectedId: job.id,
        detail: missingRead(),
        runs: missingRead(),
      },
      actions: [actionView({
        key: "native-receipt",
        operation,
        targetId: job.id,
        status: "confirmed",
        result: {
          scope: "0".repeat(64),
          outcome: "confirmed",
          operation: operation === "cron.run" ? "trigger" : "delete",
          jobId: job.id,
          job: operation === "cron.run" ? job : null,
        },
      })],
    });
    render(<HermesV2CronArea resources={resources} />);
    expect(screen.getByText(/Dieser Job existiert nativ nicht mehr/)).toBeTruthy();
    expect(visibleActions()).toEqual([
      `${operation === "cron.run" ? "Ausführen" : "Löschen"}: bestätigt mit nativer Quittung`,
    ]);
    expect(screen.queryByRole("button", { name: "Bewusst neu lesen" })).toBeNull();
  });

  it("rendert ohne passende Aktion keine Quittung und leitet aus Missing keinen Erfolg ab", () => {
    render(<HermesV2CronArea resources={makeResourceFixture({
      cron: {
        list: readyRead(cronList([])),
        selectedId: job.id,
        detail: missingRead(),
        runs: missingRead(),
      },
      actions: [actionView({ key: "other", targetId: "job-10", status: "confirmed" })],
    })} />);
    expect(screen.queryByRole("list", { name: "Cron-Aktionen" })).toBeNull();
    expect(screen.getByText(/Dieser Job existiert nativ nicht mehr/)).toBeTruthy();
    expect(screen.queryByText(/bestätigt mit nativer Quittung/)).toBeNull();
  });
});
