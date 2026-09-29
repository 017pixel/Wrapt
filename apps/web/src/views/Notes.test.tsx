// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { NotesWindowRoute } from "./Notes";

vi.mock("../components/notes/NotesWorkspace", () => ({
  NotesWorkspace: ({
    noteId,
    onSelectNote,
    windowMode,
  }: {
    noteId: string | null;
    onSelectNote: (id: string | null) => void;
    windowMode?: boolean;
  }) => (
    <section data-testid="workspace" data-window-mode={String(windowMode)}>
      <output data-testid="note-id">{noteId ?? "keine Notiz"}</output>
      <button type="button" onClick={() => onSelectNote("unterseite 1")}>
        Unterseite auswählen
      </button>
      <button type="button" onClick={() => onSelectNote(null)}>
        Letzte Seite archivieren
      </button>
    </section>
  ),
}));

afterEach(cleanup);

function CurrentPath() {
  const { pathname } = useLocation();
  return <output data-testid="route-path">{pathname}</output>;
}

function renderWindowRoute() {
  return render(
    <MemoryRouter initialEntries={["/notizen/fenster/elternseite"]}>
      <Routes>
        <Route
          path="/notizen/fenster/:noteId"
          element={
            <>
              <NotesWindowRoute />
              <CurrentPath />
            </>
          }
        />
        <Route path="/notizen" element={<output data-testid="route-path">/notizen</output>} />
      </Routes>
    </MemoryRouter>,
  );
}

it("wechselt im Notizfenster per Auswahl innerhalb derselben Fensterroute", () => {
  renderWindowRoute();

  expect(screen.getByTestId("workspace").getAttribute("data-window-mode")).toBe("true");
  expect(screen.getByTestId("note-id").textContent).toBe("elternseite");
  fireEvent.click(screen.getByRole("button", { name: "Unterseite auswählen" }));

  expect(screen.getByTestId("note-id").textContent).toBe("unterseite 1");
  expect(screen.getByTestId("route-path").textContent).toBe("/notizen/fenster/unterseite%201");
});

it("kehrt bei leerer Auswahl zur Notes-Übersicht zurück", () => {
  renderWindowRoute();
  fireEvent.click(screen.getByRole("button", { name: "Letzte Seite archivieren" }));

  expect(screen.getByTestId("route-path").textContent).toBe("/notizen");
});
