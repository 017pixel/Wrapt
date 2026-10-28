// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "../../lib/apiClient";
import { RouteActivityProvider } from "../../lib/routeActivity";
import { NotesWorkspace } from "./NotesWorkspace";

vi.mock("./NoteEditor.js", () => ({ NoteEditor: () => null }));
vi.mock("./sidebar/NotesSidebar.js", () => ({ NotesSidebar: () => null }));
vi.mock("./search/NotesCommandPalette.js", () => ({ NotesCommandPalette: () => null }));
vi.mock("../../lib/useMediaQuery", () => ({ useMediaQuery: () => false }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("pausiert den Workspace für 60 Sekunden und revalidiert bei Rückkehr", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const detail = vi.spyOn(apiClient, "note").mockResolvedValue({ note: null } as never);
  vi.spyOn(apiClient, "notes").mockResolvedValue({ notes: [], folders: [] } as never);
  const component = <NotesWorkspace noteId="note" onSelectNote={() => {}} />;
  const content = (active: boolean) => <QueryClientProvider client={client}>
    <RouteActivityProvider active={active}>{component}</RouteActivityProvider>
  </QueryClientProvider>;
  const view = render(content(true));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(detail).toHaveBeenCalledOnce();
  view.rerender(content(false));
  detail.mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(detail).not.toHaveBeenCalled();
  expect(client.getQueryData(["notes", "detail", "note"])).toEqual({ note: null });
  view.rerender(content(true));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(detail).toHaveBeenCalledOnce();
  client.clear();
});

it("ein sichtbarer Observer hält dieselbe Notiz trotz geparktem Observer aktuell", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const detail = vi.spyOn(apiClient, "note").mockResolvedValue({ note: null } as never);
  vi.spyOn(apiClient, "notes").mockResolvedValue({ notes: [], folders: [] } as never);
  render(<QueryClientProvider client={client}>
    <RouteActivityProvider active={false}><NotesWorkspace noteId="note" onSelectNote={() => {}} /></RouteActivityProvider>
    <RouteActivityProvider active><NotesWorkspace noteId="note" onSelectNote={() => {}} /></RouteActivityProvider>
  </QueryClientProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(detail).toHaveBeenCalledOnce();
  detail.mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  expect(detail).toHaveBeenCalledOnce();
  client.clear();
});
