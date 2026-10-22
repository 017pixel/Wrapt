// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { CodePluginSync } from "./CodePluginSync";
import { pluginRequest } from "./code-client";

const runtime = vi.hoisted(() => ({ sync: vi.fn(), close: vi.fn(), deliver: vi.fn() }));
vi.mock("./code-client", () => ({
  CodePluginClientRuntime: class { sync = runtime.sync; close = runtime.close; deliver = runtime.deliver; },
  pluginRequest: vi.fn(),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("bündelt einen Ereignissturm während einer laufenden Abfrage und räumt beim Schließen auf", async () => {
  const sources: Array<{ onmessage?: (event: { data: string }) => void; close: () => void }> = [];
  vi.stubGlobal("EventSource", class {
    onmessage?: (event: { data: string }) => void;
    close = vi.fn();
    constructor() { sources.push(this); }
  });
  let resolveFirst!: (value: { plugins: [] }) => void;
  vi.mocked(pluginRequest).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue({ plugins: [] });
  const view = render(<MemoryRouter><CodePluginSync /></MemoryRouter>);
  const events = sources[0]!;
  for (let index = 0; index < 30; index++) events.onmessage?.({ data: JSON.stringify({ name: "host:plugins.changed" }) });
  expect(pluginRequest).toHaveBeenCalledTimes(1);
  await act(async () => { resolveFirst({ plugins: [] }); });
  expect(pluginRequest).toHaveBeenCalledTimes(2);
  view.unmount();
  await act(async () => { await Promise.resolve(); });
  expect(events.close).toHaveBeenCalledTimes(1);
  expect(runtime.close).toHaveBeenCalledTimes(1);
});
