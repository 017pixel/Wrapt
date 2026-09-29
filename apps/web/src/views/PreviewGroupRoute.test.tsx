// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { useSidebarPreferences } from "../stores/sidebarPreferences";
import { PreviewGroupRoute } from "./PreviewGroupRoute";

afterEach(() => {
  cleanup();
  useSidebarPreferences.setState({ hiddenPages: new Set(["workbench"]) });
});

function renderPreviewGroup(orbitEnabled: boolean) {
  useSidebarPreferences.setState({ hiddenPages: orbitEnabled ? new Set() : new Set(["workbench"]) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["orbit"], {
    document: {
      boards: [{ id: "board", nodes: [{ id: "group", type: "previewGroup", title: "Vorschau", previewLayout: "1" }] }],
    },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/preview-groups/group"]}>
        <Routes><Route path="/preview-groups/:groupId" element={<PreviewGroupRoute />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("blendet den Orbit-Link bei deaktiviertem Orbit aus", () => {
  renderPreviewGroup(false);
  expect(screen.getByRole("heading", { name: "Vorschau" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Im Orbit öffnen" })).toBeNull();
});

it("zeigt den Orbit-Link nach Aktivierung", () => {
  renderPreviewGroup(true);
  expect(screen.getByRole("link", { name: "Im Orbit öffnen" }).getAttribute("href")).toBe("/orbit");
});
