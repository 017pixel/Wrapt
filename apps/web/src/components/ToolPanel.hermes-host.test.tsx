// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HermesShellProps } from "./hermes/HermesClassicShell";
import { RouteActivityProvider } from "../lib/routeActivity";
import { ToolPanel } from "./ToolPanel";

const shell = vi.hoisted(() => ({ props: null as HermesShellProps | null }));
vi.mock("./hermes/HermesShell", () => ({ HermesShell: (props: HermesShellProps) => { shell.props = props; return null; } }));
vi.mock("./terminal/TerminalArea", () => ({ TerminalArea: () => null }));
afterEach(cleanup);

describe("optionale Hermeshost-Prop im echten ToolPanel", () => {
  it("reicht den Callback unverändert weiter und erhält bestehende Aktivitätsguards", async () => {
    const onHermesPathChange = vi.fn();
    const client = new QueryClient();
    const panel = { id: "exact-panel", type: "hermes" as const, projectId: null, previewId: null,
      reloadKey: 0, hermesAdminPath: "/chat?resume=own" };
    const surface = (active: boolean, focused: boolean, callback = true) => <QueryClientProvider client={client}>
      <RouteActivityProvider active={active}><ToolPanel panel={panel} project={undefined} isFocused={focused}
        {...(callback ? { onHermesPathChange } : {})} /></RouteActivityProvider>
    </QueryClientProvider>;
    const { rerender } = render(surface(true, true));
    await waitFor(() => expect(shell.props?.onHermesPathChange).toBe(onHermesPathChange));
    expect(shell.props?.panel).toBe(panel);
    expect(shell.props?.active).toBe(true);
    rerender(surface(false, true));
    expect(shell.props?.active).toBe(false);
    rerender(surface(true, false));
    expect(shell.props?.active).toBe(false);
    rerender(surface(true, true, false));
    expect(shell.props?.onHermesPathChange).toBeUndefined();
    client.clear();
  });
});
