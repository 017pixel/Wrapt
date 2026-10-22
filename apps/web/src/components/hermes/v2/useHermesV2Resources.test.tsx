// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as chatModule from "./chat-runtime";
import { useHermesV2Resources } from "./useHermesV2Resources";
import { heldResource, jsonResource, memoryData, pendingData, resourceFixture, settleResources, type ResourceFixture } from "./resource-test-fixtures";
import type { HermesV2ResourcesOptions } from "./resource-types";

describe("Öffentlicher Ressourcenhook mit vorhandenem Owner", () => {
  let f: ResourceFixture;
  afterEach(() => { cleanup(); f?.cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function prepare() {
    f = await resourceFixture(null); f.runtime.dispose();
    vi.spyOn(chatModule, "getChatRuntime").mockReturnValue(f.chat);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (path) => jsonResource(String(path).endsWith("pending") ? pendingData() : memoryData()));
    vi.stubGlobal("fetch", fetcher);
    const options: HermesV2ResourcesOptions = { ownerId: "resource-owner", enabled: true, active: true, visible: true,
      area: "memory", signal: new AbortController().signal };
    return { fetcher, options };
  }
  it("hält StrictMode flüchtig und erzeugt keine zweite Verbindung oder Chatowner", async () => {
    const { options } = await prepare();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useHermesV2Resources(options), { wrapper });
    await act(settleResources);
    expect(result.current.memory.status).toBe("ready"); expect(result.current.pending.status).toBe("ready");
    expect(f.gateway.sockets).toHaveLength(1); expect(f.chat.owners.records.size).toBe(1);
    expect(f.gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(0);
  });
  it("entwertet Hidden-Aktualisierung und nimmt alte Antwort nach A-B-A nicht an", async () => {
    const { options, fetcher } = await prepare();
    const { result, rerender } = renderHook((props) => useHermesV2Resources(props), { initialProps: options });
    await act(settleResources);
    const held = heldResource<Response>(); let oldSignal: AbortSignal | undefined;
    fetcher.mockImplementationOnce((_path, init) => { oldSignal = init?.signal as AbortSignal; return held.promise; });
    let read: Promise<void>;
    await act(async () => { read = result.current.refresh(); await settleResources(); });
    rerender({ ...options, visible: false }); rerender(options); await act(settleResources);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { held.resolve(jsonResource({ ...memoryData(), active: "stale" })); await read; });
    expect(result.current.memory.data?.active).toBe("builtin");
  });
  it("stoppt Fetch und Listener beim Unmount ohne den Chatowner zu schließen", async () => {
    const { options, fetcher } = await prepare();
    const held = heldResource<Response>(); const signals: AbortSignal[] = [];
    fetcher.mockImplementation((_path, init) => { signals.push(init?.signal as AbortSignal); return held.promise; });
    const { unmount } = renderHook(() => useHermesV2Resources(options)); await act(settleResources);
    unmount(); expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(f.chat.owners.records.get("resource-owner")?.mounted).toBe(true);
    held.resolve(jsonResource(memoryData())); await act(settleResources);
  });
});
