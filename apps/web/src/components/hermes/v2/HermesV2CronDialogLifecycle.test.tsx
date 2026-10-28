// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesV2CronForm } from "./HermesV2CronForm";
import { HermesV2CronRunConfirm } from "./HermesV2CronConfirms";
import { cronJob } from "./resource-cron-fixtures";
import { actionView, makeResourceFixture } from "./resource-fixtures";

vi.mock("../../../lib/apiClient/projects", () => ({
  projectsApi: { projects: vi.fn().mockResolvedValue({ projects: [] }) },
}));
afterEach(cleanup);
const job = cronJob();

describe("Cron-Dialoge binden Ziel und Quittung an den konkreten Versuch", () => {
  it("schließt einen ungesendeten Editdialog weder durch fremdes Create noch fremdes Update", () => {
    const fixture = makeResourceFixture();
    const close = vi.fn();
    const props = { resources: fixture, target: { mode: "edit" as const, jobId: job.id }, initial: job, open: true, onClose: close };
    const view = render(<HermesV2CronForm {...props} />);
    fixture.actions = [actionView({ operation: "cron.create", status: "confirmed" })];
    view.rerender(<HermesV2CronForm {...props} />);
    fixture.actions = [...fixture.actions, actionView({ key: "update", operation: "cron.update", targetId: job.id, status: "confirmed" })];
    view.rerender(<HermesV2CronForm {...props} />);
    expect(close).not.toHaveBeenCalled();
  });

  it("bindet den zweiten Formularversuch nach einer Ablehnung an dessen neue Quittung", async () => {
    const fixture = makeResourceFixture();
    const close = vi.fn();
    const props = { resources: fixture, target: { mode: "create" as const }, initial: null, open: true, onClose: close };
    const view = render(<HermesV2CronForm {...props} />);
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "every 30m" } });
    fireEvent.click(screen.getByRole("button", { name: "Erstellen" }));
    fixture.actions = [actionView({ key: "first", status: "rejected" })];
    view.rerender(<HermesV2CronForm {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Erstellen" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Erstellen" }));
    fixture.actions = [...fixture.actions, actionView({ key: "second", status: "confirmed" })];
    view.rerender(<HermesV2CronForm {...props} />);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(fixture.createCron).toHaveBeenCalledTimes(2);
  });

  it("sendet beim synchronen Doppelsubmit nur einen Create-Aufruf", () => {
    const fixture = makeResourceFixture({ createCron: vi.fn(() => new Promise<void>(() => {})) });
    render(<HermesV2CronForm resources={fixture} target={{ mode: "create" }} initial={null} open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "every 30m" } });
    const form = screen.getByLabelText("Schedule").closest("form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(fixture.createCron).toHaveBeenCalledOnce();
  });

  it("schreibt bei fremden Detaildaten keine Änderungen an die vorherige Ziel-ID", () => {
    const fixture = makeResourceFixture();
    const props = { resources: fixture, target: { mode: "edit" as const, jobId: job.id }, initial: job, open: true, onClose: () => {} };
    const view = render(<HermesV2CronForm {...props} />);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Entwurf für A" } });
    view.rerender(<HermesV2CronForm {...props} initial={cronJob({ id: "job-b", name: "B" })} />);
    expect(screen.getByRole("button", { name: "Änderungen senden" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Prompt").closest("form")!);
    expect(fixture.updateCron).not.toHaveBeenCalled();
  });

  it("holt nach Zielwechsel ein Token für den angezeigten Job und ignoriert alte bestätigte Aktionen", async () => {
    const fixture = makeResourceFixture();
    const close = vi.fn();
    const prepare = vi.fn(fixture.prepareCronConfirmation);
    fixture.prepareCronConfirmation = prepare;
    const view = render(<HermesV2CronRunConfirm resources={fixture} job={job} onClose={close} />);
    prepare.mockReturnValue({ key: "token-b", generation: 1, targetId: "job-b", operation: "cron.run", paused: false });
    fixture.actions = [actionView({ operation: "cron.run", targetId: job.id, status: "confirmed" })];
    view.rerender(<HermesV2CronRunConfirm resources={fixture} job={cronJob({ id: "job-b" })} onClose={close} />);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ausführen" }));
    expect(fixture.runCron).toHaveBeenCalledWith(expect.objectContaining({ targetId: "job-b" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ausführen" })).toBeEnabled());
  });

  it("verwendet beim zweiten Run-Versuch eine neue Bestätigung und schließt nach dessen Quittung", async () => {
    let number = 0;
    const prepare = vi.fn(() => ({ key: `token-${++number}`, generation: 1, targetId: job.id, operation: "cron.run" as const, paused: false }));
    const fixture = makeResourceFixture({ prepareCronConfirmation: prepare });
    const close = vi.fn();
    const view = render(<HermesV2CronRunConfirm resources={fixture} job={job} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Ausführen" }));
    fixture.actions = [actionView({ key: "first", operation: "cron.run", targetId: job.id, status: "rejected" })];
    view.rerender(<HermesV2CronRunConfirm resources={fixture} job={job} onClose={close} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ausführen" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Ausführen" }));
    const calls = vi.mocked(fixture.runCron).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0].key).not.toBe(calls[1]![0].key);
    fixture.actions = [...fixture.actions, actionView({ key: "second", operation: "cron.run", targetId: job.id, status: "confirmed" })];
    view.rerender(<HermesV2CronRunConfirm resources={fixture} job={job} onClose={close} />);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
