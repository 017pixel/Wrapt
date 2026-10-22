// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectsApi } from "../../../lib/apiClient/projects";
import { HermesV2NewSessionDialog } from "./HermesV2NewSessionDialog";
import type { HermesV2Chat } from "./chat-types";

vi.mock("../../../lib/apiClient/projects", () => ({
  projectsApi: { projects: vi.fn() },
}));
const projects = vi.mocked(projectsApi.projects);

const createSession = vi
  .fn<(options: { projectId: string | null }) => Promise<string>>()
  .mockResolvedValue("neu");
const chatFixture = { createSession } as unknown as HermesV2Chat;

type ProjectFixture = {
  id: string;
  name: string;
  lastWorkbenchUseAt: string | null;
};

type Deferred = {
  resolve: (value: { projects: ProjectFixture[] }) => void;
  reject: (reason: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<{ projects: ProjectFixture[] }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  projects.mockImplementationOnce((() => promise) as never);
  return { resolve, reject };
}

function bodyText(): string {
  return document.body.textContent ?? "";
}

/** Der Client liefert ganze Projektobjekte; der Dialog braucht nur die Auswahl. */
function resolveProjects(
  entries: ProjectFixture[],
): { projects: ProjectFixture[] } {
  return {
    projects: entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      activity: {
        lastWorkbenchUseAt: entry.lastWorkbenchUseAt,
        lastFilesystemChangeAt: null,
        lastGitCommitAt: null,
        effectiveAt: null,
      },
    })),
  } as unknown as { projects: ProjectFixture[] };
}

function renderDialog(onClose = vi.fn()) {
  return render(
    <HermesV2NewSessionDialog chat={chatFixture} open onClose={onClose} />,
  );
}

describe("HermesV2NewSessionDialog", () => {
  afterEach(() => {
    cleanup();
    projects.mockReset();
    createSession.mockClear();
  });

  it("zeigt Ladefehler der Projektliste deutlich statt stumm", async () => {
    deferred().reject(new Error("offline"));
    renderDialog();
    const note = await screen.findByRole("status");
    expect(note.textContent).toContain(
      "Projektliste konnte nicht geladen werden",
    );
    expect(bodyText()).toContain("Ohne Projekt");
  });

  it("entwertet veraltete Ergebnisse: Abbruch gilt nicht als Fehler und überspielt den Wiederöffner nicht", async () => {
    const first = deferred();
    const { rerender } = render(
      <HermesV2NewSessionDialog chat={chatFixture} open onClose={vi.fn()} />,
    );
    rerender(
      <HermesV2NewSessionDialog
        chat={chatFixture}
        open={false}
        onClose={vi.fn()}
      />,
    );
    const second = deferred();
    rerender(
      <HermesV2NewSessionDialog chat={chatFixture} open onClose={vi.fn()} />,
    );
    second.resolve(
      resolveProjects([{ id: "p1", name: "Aktuelles Projekt", lastWorkbenchUseAt: null }]),
    );
    await waitFor(() => {
      expect(projects).toHaveBeenCalledTimes(2);
    });
    // Veraltetes Abschlussereignis des ersten Ladens darf nichts mehr setzen.
    first.resolve(
      resolveProjects([{ id: "stale", name: "Veraltetes Ergebnis", lastWorkbenchUseAt: null }]),
    );
    await Promise.resolve();
    expect(screen.queryByText(/Projektliste konnte nicht geladen/)).toBeNull();
    const trigger = screen.getByRole("button", { name: /Projekt wählen/ });
    fireEvent.click(trigger);
    expect(screen.queryByText("Veraltetes Ergebnis")).toBeNull();
    expect(screen.getByRole("option", { name: "Aktuelles Projekt" })).toBeTruthy();
  });

  it("wertet einen beim Schließen abgebrochenen Abruf nicht als Fehler", async () => {
    const first = deferred();
    const { rerender } = render(
      <HermesV2NewSessionDialog chat={chatFixture} open onClose={vi.fn()} />,
    );
    rerender(
      <HermesV2NewSessionDialog
        chat={chatFixture}
        open={false}
        onClose={vi.fn()}
      />,
    );
    // Der Effekt bricht den Abruf mit abort ab; die Ablehnung darf keinen Fehler hinterlassen.
    first.reject(new DOMException("aborted", "AbortError"));
    await Promise.resolve();
    expect(bodyText()).not.toContain(
      "Projektliste konnte nicht geladen werden",
    );
  });

  it("ersetzt das native select durch einen Chip im Dialogkopf", async () => {
    deferred().resolve(resolveProjects([]));
    renderDialog();
    await waitFor(() => expect(projects).toHaveBeenCalled());
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.querySelector("select")).toBeNull();
    const trigger = screen.getByRole("button", { name: /Projekt wählen/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // Der Chip gehört zum Dialog und ersetzt das Auswahlfeld im Formular.
    expect(trigger.closest(".modal-sheet")).toBeTruthy();
    expect(trigger.closest(".hermesv2-new-session-form")).toBeTruthy();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox", { name: "Projekt" })).toBeTruthy();
  });

  it("sortiert Projekte nach letzter Nutzung und stellt „Ohne Projekt“ voran", async () => {
    deferred().resolve(
      resolveProjects([
        { id: "alt", name: "Alpha", lastWorkbenchUseAt: "2026-01-02T10:00:00.000Z" },
        { id: "neu", name: "Omega", lastWorkbenchUseAt: "2026-05-02T10:00:00.000Z" },
        { id: "ohne", name: "Beta", lastWorkbenchUseAt: null },
      ]),
    );
    renderDialog();
    await waitFor(() => expect(projects).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Projekt wählen/ }));
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Ohne Projekt", "Omega", "Alpha", "Beta"]);
  });

  it("wählt ein Projekt und übergibt es an die Sitzungserstellung", async () => {
    deferred().resolve(
      resolveProjects([
        { id: "p1", name: "Projekt Eins", lastWorkbenchUseAt: null },
      ]),
    );
    renderDialog();
    await waitFor(() => expect(projects).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Projekt wählen/ }));
    fireEvent.click(screen.getByRole("option", { name: "Projekt Eins" }));
    expect(
      screen.getByRole("button", { name: /Projekt wählen: Projekt Eins/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sitzung erstellen" }));
    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith({
        projectId: "p1",
      }),
    );
  });

  it("bedient die Liste mit der Tastatur und schließt sie mit Escape, ohne den Dialog zu schließen", async () => {
    deferred().resolve(
      resolveProjects([
        { id: "p1", name: "Projekt Eins", lastWorkbenchUseAt: null },
        { id: "p2", name: "Projekt Zwei", lastWorkbenchUseAt: null },
      ]),
    );
    const onClose = vi.fn();
    renderDialog(onClose);
    await waitFor(() => expect(projects).toHaveBeenCalled());
    const trigger = screen.getByRole("button", { name: /Projekt wählen/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(3);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("option", { name: "Ohne Projekt" }),
      ),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Projekt Eins" }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Projekt Zwei" }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
