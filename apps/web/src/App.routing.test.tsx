// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { HomeRedirect } from "./App";

function CurrentPath() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}

describe("HomeRedirect", () => {
  it("leitet den alten Inbox-Pfad ohne wechselnde Hook-Anzahl zum Dashboard um", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <HomeRedirect />
                <CurrentPath />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(container.querySelector("output")?.textContent).toBe("/");
    });
  });
});
