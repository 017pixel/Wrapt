// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2CronForm } from "./HermesV2CronForm";
import { cronJob } from "./resource-cron-fixtures";
import { actionView, makeResourceFixture, readyRead } from "./resource-fixtures";
import type { HermesV2CronDetail } from "@wrapt/contracts/hermes-v2";

vi.mock("../../../lib/apiClient/projects", () => ({
  projectsApi: {
    projects: vi.fn().mockResolvedValue({ projects: [{ id: "wrapt", name: "Wrapt" }] }),
  },
}));

const job = cronJob();

function renderForm(fixture: ReturnType<typeof makeResourceFixture>) {
  const view = render(
    <HermesV2CronForm
      resources={fixture}
      target={{ mode: "edit", jobId: "job-1" }}
      initial={job}
      open
      onClose={() => undefined}
    />,
  );
  return view;
}

afterEach(cleanup);

describe("HermesV2CronForm", () => {
  it("Bearbeiten sendet nur das berührte Prompt; Name bleibt nativ frisch", () => {
    const updateCron = vi.fn().mockResolvedValue(undefined);
    const detail: HermesV2CronDetail = { scope: "0".repeat(64), job };
    const fixture = makeResourceFixture({
      updateCron,
      cron: { list: readyRead({ scope: "0".repeat(64), jobs: [job], truncated: false }), selectedId: "job-1", detail: readyRead(detail), runs: readyRead({ scope: "0".repeat(64), jobId: "job-1", runs: [], truncated: false }) },
    } as never);
    const view = renderForm(fixture);
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Neu formulierter Prompt" },
    });
    // Nativer Name ändert sich im Hintergrund; der Prompt-Entwurf bleibt.
    const freshJob = { ...job, name: "Nativ umbenannt" };
    fixture.cron = {
      ...fixture.cron,
      detail: readyRead({ scope: detail.scope, job: freshJob } as HermesV2CronDetail),
    };
    view.rerender(
      <HermesV2CronForm
        resources={fixture}
        target={{ mode: "edit", jobId: "job-1" }}
        initial={freshJob}
        open
        onClose={() => undefined}
      />,
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Nativ umbenannt");
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe("Neu formulierter Prompt");
    fireEvent.click(screen.getByRole("button", { name: "Änderungen senden" }));
    expect(updateCron).toHaveBeenCalledWith("job-1", { prompt: "Neu formulierter Prompt" });
  });

  it("Wiederholung 5 und \"5\" sind dieselbe native Angabe", () => {
    const updateCron = vi.fn().mockResolvedValue(undefined);
    renderForm(
      makeResourceFixture({ updateCron } as never),
    );
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Wiederholung"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen senden" }));
    expect(updateCron).toHaveBeenCalledWith("job-1", { prompt: "x" });
  });

  it("Projektbindung bleibt erhalten, solange nichts gewählt wird", () => {
    const updateCron = vi.fn().mockResolvedValue(undefined);
    renderForm(makeResourceFixture({ updateCron } as never));
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "nur Prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen senden" }));
    const updates = updateCron.mock.calls.at(0)?.[1];
    expect(updates).toEqual({ prompt: "nur Prompt" });
    expect(updates && "projectId" in updates).toBe(false);
  });

  it("create bleibt offen bei älterer confirmed Quittung; schließt erst an der eigenen", async () => {
    const createCron = vi.fn().mockResolvedValue(undefined);
    const old = actionView({ key: "old-create", operation: "cron.create", targetId: "job-alt", status: "confirmed" });
    const fixture = makeResourceFixture({ createCron, actions: [old] } as never);
    const closeCreate = vi.fn();
    const { rerender } = render(
      <HermesV2CronForm resources={fixture} target={{ mode: "create" }} initial={null} open onClose={closeCreate} />,
    );
    expect(screen.getByRole("dialog", { name: "Neuen Cron-Job erstellen" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Neuer Job" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "every 30m" } });
    fireEvent.click(screen.getByRole("button", { name: "Erstellen" }));
    expect(closeCreate).not.toHaveBeenCalled();
    // Eigene konkrete Quittung erscheint.
    fixture.actions = [
      old,
      actionView({ key: "own-create", operation: "cron.create", targetId: "job-neu", status: "confirmed" }),
    ];
    rerender(
      <HermesV2CronForm resources={fixture} target={{ mode: "create" }} initial={null} open onClose={closeCreate} />,
    );
    await waitFor(() => expect(closeCreate).toHaveBeenCalledTimes(1));
  });
});
