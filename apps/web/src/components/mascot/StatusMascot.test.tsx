// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { StatusMascot } from "./StatusMascot";

const runtime = vi.hoisted(() => ({ prepare: vi.fn(async () => {}) }));
vi.mock("./StatusMascotCreature", () => ({
  prepareStatusMascot: runtime.prepare,
  StatusMascotCreature: () => <span data-testid="creature" />,
}));
vi.mock("../../lib/queryOptions", () => ({ wraptQueries: { mascot: () => ({
  queryKey: ["mascot"], queryFn: async () => ({ mascot: { enabled: false, scale: 1 } }), staleTime: Infinity,
}) } }));
afterEach(cleanup);

it("lädt die Creature erst bei Aktivierung und verwendet sie beim nächsten Aktivieren erneut", async () => {
  const client = new QueryClient();
  client.setQueryData(["mascot"], { mascot: { enabled: false, scale: 1 } });
  const view = render(<QueryClientProvider client={client}><StatusMascot /></QueryClientProvider>);
  expect(view.container.childElementCount).toBe(0);
  expect(runtime.prepare).not.toHaveBeenCalled();
  await act(async () => {
    client.setQueryData(["mascot"], { mascot: { enabled: true, scale: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await vi.waitFor(() => expect(view.queryByTestId("creature")).not.toBeNull());
  expect(runtime.prepare).toHaveBeenCalledOnce();
  await act(async () => { client.setQueryData(["mascot"], { mascot: { enabled: false, scale: 1 } }); });
  await vi.waitFor(() => expect(view.queryByTestId("creature")).toBeNull());
  await act(async () => { client.setQueryData(["mascot"], { mascot: { enabled: true, scale: 1 } }); });
  await vi.waitFor(() => expect(view.queryByTestId("creature")).not.toBeNull());
  expect(runtime.prepare).toHaveBeenCalledOnce();
  client.clear();
});
