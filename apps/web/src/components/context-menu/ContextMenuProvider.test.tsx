// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { defaultContextMenuConfig } from "@wrapt/contracts";
import { registerHostContextMenus, hostContextMenuId } from "../../extensions/hostContextMenus";
import { wraptQueries } from "../../lib/queryOptions";
import { ContextMenuProvider } from "./ContextMenuProvider";
import { openGlobalContextMenu } from "./contextMenuEvents";

function renderProvider(child: React.ReactNode, enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(wraptQueries.contextMenu().queryKey, {
    contextMenu: { ...defaultContextMenuConfig, surfaces: { "host.context-menu.file": { enabled } } },
  });
  return render(<QueryClientProvider client={client}><MemoryRouter><ContextMenuProvider>{child}</ContextMenuProvider></MemoryRouter></QueryClientProvider>);
}

describe("ContextMenuProvider", () => {
  beforeEach(() => registerHostContextMenus());
  afterEach(cleanup);

  it("rendert eine kontextgebundene Registry-Aktion und führt sie aus", () => {
    const run = vi.fn();
    renderProvider(<button type="button" onContextMenu={(event) => openGlobalContextMenu(event, {
      surface: "host.context-menu.file",
      title: "Datei.txt",
      actions: [{ id: hostContextMenuId("file.open"), onSelect: run }],
    })}>Datei</button>);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Datei" }), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Öffnen" }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lässt das native Verhalten zu, wenn die Surface deaktiviert ist", () => {
    renderProvider(<button type="button" onContextMenu={(event) => openGlobalContextMenu(event, {
      surface: "host.context-menu.file",
      actions: [{ id: hostContextMenuId("file.open"), onSelect: vi.fn() }],
    })}>Datei</button>, false);

    expect(fireEvent.contextMenu(screen.getByRole("button", { name: "Datei" }))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ignoriert iframe-Knoten im dokumentweiten Fallback", () => {
    renderProvider(<iframe title="Eingebettete App" data-context-menu-surface="host.context-menu.file" />);
    expect(fireEvent.contextMenu(screen.getByTitle("Eingebettete App"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
