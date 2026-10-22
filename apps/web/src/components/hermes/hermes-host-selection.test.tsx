// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import type * as AdminFrameModule from "./HermesAdminFrame";
import { useLayoutStore } from "../../stores/layout";
import { HermesClassicShell, type HermesShellProps } from "./HermesClassicShell";
import { useHermesV2Selection } from "./v2/shell-selection";
import { useHermesPathCallback } from "./useHermesPathCallback";

const frame = vi.hoisted(() => ({ props: null as null | { path: string; onPathChange: (path: string) => void } }));
vi.mock("./HermesAdminFrame", async (original) => ({
  ...await original<typeof AdminFrameModule>(),
  HermesAdminFrame: (props: NonNullable<typeof frame.props>) => { frame.props = props; return null; },
}));

const panel = { id: "host-a", type: "hermes" as const, projectId: null, previewId: null, reloadKey: 0 };
const wrapper = ({ children }: PropsWithChildren) => <MemoryRouter initialEntries={["/workbench?session=foreign&keep=yes"]}>{children}</MemoryRouter>;
beforeEach(() => {
  useLayoutStore.getState().resetLayout();
  useLayoutStore.setState({ panels: [panel, { ...panel, id: "other", hermesAdminPath: "/chat?resume=other" }] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Hostgebundene Sitzungsauswahl", () => {
  it("meldet gewählte/erstellte Sitzung und Reset an den Host ohne Layout- oder globale URLänderung", () => {
    const callback = vi.fn();
    const { result, rerender } = renderHook(({ path }) => ({
      ...useHermesV2Selection("panel", panel.id, path, true, callback), location: useLocation(),
    }), { initialProps: { path: "/chat?resume=saved" }, wrapper });
    expect(result.current.sessionId).toBe("saved");
    act(() => result.current.selectSession("created/full-id"));
    expect(callback).toHaveBeenLastCalledWith("/chat?resume=created%2Ffull-id");
    rerender({ path: "/chat?resume=created%2Ffull-id" });
    expect(result.current.sessionId).toBe("created/full-id");
    act(() => result.current.selectSession(null));
    expect(callback).toHaveBeenLastCalledWith("/chat");
    expect(result.current.location.search).toBe("?session=foreign&keep=yes");
    expect(useLayoutStore.getState().panels).toEqual([panel, { ...panel, id: "other", hermesAdminPath: "/chat?resume=other" }]);
  });

  it("erhält ohne optionalen Callback den genauen normalen Layoutpfad", () => {
    const { result } = renderHook(() => useHermesV2Selection("panel", panel.id, undefined, true), { wrapper });
    act(() => result.current.selectSession("layout-id"));
    expect(useLayoutStore.getState().panels[0]?.hermesAdminPath).toBe("/chat?resume=layout-id");
    expect(useLayoutStore.getState().panels[1]?.hermesAdminPath).toBe("/chat?resume=other");
  });

  it("erhält Route/Standalone in der URL und bewahrt andere Parameter", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => ({
      ...useHermesV2Selection("route", undefined, undefined, true, callback), location: useLocation(),
    }), { wrapper });
    act(() => result.current.selectSession("ordner/id"));
    expect(result.current.sessionId).toBe("ordner/id");
    expect(new URLSearchParams(result.current.location.search).get("keep")).toBe("yes");
    expect(callback).not.toHaveBeenCalled();
    act(() => result.current.selectSession(null));
    expect(result.current.sessionId).toBeNull();
  });

  it("entwertet gehaltene Auswahl bei Host-, Pfad-, Aktivitäts- und Callback-A-B-A", () => {
    const first = vi.fn(); const second = vi.fn();
    const initial = { id: "a", active: true, path: "/chat", commit: first };
    const { result, rerender, unmount } = renderHook((props) => useHermesPathCallback(props.id, props.active, props.path, props.commit), { initialProps: initial });
    for (const changed of [{ ...initial, id: "b" }, { ...initial, active: false },
      { ...initial, path: "/chat?resume=other" }, { ...initial, commit: second }]) {
      const old = result.current;
      rerender(changed); rerender(initial);
      act(() => old("/chat?resume=stale"));
    }
    expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled();
    act(() => result.current("/chat?resume=current"));
    expect(first).toHaveBeenCalledExactlyOnceWith("/chat?resume=current");
    const old = result.current; unmount(); old("/chat?resume=unmounted");
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("behält dieselbe unveränderte Bindung nutzbar und ignoriert fremde URLs", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(() => useHermesPathCallback("a", true, "/chat", commit));
    const held = result.current; rerender();
    act(() => { held("https://fremd.test/chat"); held("/settings"); });
    expect(commit).toHaveBeenCalledExactlyOnceWith("/settings");
  });
});

describe("Classic Hostpfad", () => {
  function surface(props: Partial<HermesShellProps>) {
    return <MemoryRouter initialEntries={["/workbench?session=foreign"]}>
      <HermesClassicShell variant="panel" active panel={panel} {...props} />
    </MemoryRouter>;
  }

  it("liest eigenen Hostpfad, meldet Classicnavigation und liest externe Auswahl erneut", () => {
    const callback = vi.fn();
    const { rerender } = render(surface({ panel: { ...panel, hermesAdminPath: "/chat?resume=own" }, onHermesPathChange: callback }));
    expect(frame.props?.path).toBe("/chat?resume=own");
    const old = frame.props!.onPathChange;
    act(() => frame.props!.onPathChange("/settings?tab=models"));
    expect(callback).toHaveBeenLastCalledWith("/settings?tab=models");
    rerender(surface({ panel: { ...panel, hermesAdminPath: "/chat?resume=external" }, onHermesPathChange: callback }));
    expect(frame.props?.path).toBe("/chat?resume=external");
    act(() => old("/chat?resume=stale"));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("erhält ohne Hostcallback den bisherigen Layoutpfad", () => {
    render(surface({}));
    act(() => frame.props!.onPathChange("/cron/job-1"));
    expect(useLayoutStore.getState().panels[0]?.hermesAdminPath).toBe("/cron/job-1");
  });

  it("verhindert Rückmeldung vom geparkten oder gewechselten Classichost", () => {
    const callback = vi.fn();
    const { rerender } = render(surface({ onHermesPathChange: callback }));
    const old = frame.props!.onPathChange;
    rerender(surface({ active: false, onHermesPathChange: callback }));
    act(() => { old("/settings"); frame.props!.onPathChange("/settings"); });
    rerender(surface({ panel: { ...panel, id: "host-b" }, onHermesPathChange: callback }));
    act(() => old("/cron"));
    expect(callback).not.toHaveBeenCalled();
  });
});
