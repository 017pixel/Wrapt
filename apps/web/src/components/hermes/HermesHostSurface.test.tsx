// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ChatOptions } from "./v2/chat-types";
import { requestChatFixture } from "./v2/request-card-fixtures";
import { stubHermesViewport } from "../../test/hermesViewport";
import { useAppPreferences } from "../../stores/appPreferences";
import { HermesShell } from "./HermesShell";

const options: HermesV2ChatOptions[] = [];
const chat = requestChatFixture();
vi.mock("./v2/useHermesV2Chat", () => ({ useHermesV2Chat: (value: HermesV2ChatOptions) => {
  options.push(value); return chat;
} }));
vi.mock("./v2/useHermesV2Sidebar", async () => {
  const { makeSidebar } = await import("./v2/sidebar-test-fixtures");
  return { useHermesV2Sidebar: () => makeSidebar() };
});
vi.mock("./v2/HermesV2ChatSurface", () => ({ HermesV2ChatSurface: () => null }));

beforeEach(async () => {
  // Der echte Lazy-Einstieg lädt seine Module vor der UIinteraktion vollständig.
  await import("./v2/HermesV2Shell");
  options.length = 0;
  useAppPreferences.setState({ hermesV2Enabled: true });
  stubHermesViewport();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Hostcallback durch echte HermesShell und V2Surface", () => {
  // Der Test mountet die echte Oberflaeche mit lazy Chunks. Im parallelen
  // Gesamtlauf reicht die Standardfrist nicht.
  const LAZY_TIMEOUT = 30_000;

  it("bindet Auswahl und Classiclink an den Host, ohne fremde Routenquery zu übernehmen", async () => {
    const callback = vi.fn();
    const surface = (path: string, active = true) => <MemoryRouter initialEntries={["/workbench?session=foreign"]}>
      <HermesShell variant="panel" active={active} onHermesPathChange={callback} panel={{
        id: "exact-node", type: "hermes", projectId: null, previewId: null, reloadKey: 0, hermesAdminPath: path,
      }} />
    </MemoryRouter>;
    const { container, rerender } = render(surface("/chat?resume=own"));
    await waitFor(() => expect(container.querySelector("[data-hermes-ui='v2']")).not.toBeNull());
    await waitFor(() => expect(options.at(-1)?.sessionId).toBe("own"));
    expect(options.at(-1)?.ownerId).toBe("hermes-panel-exact-node");
    const old = options.at(-1)!.onSelectSession!;
    act(() => old("created/full-id"));
    expect(callback).toHaveBeenCalledExactlyOnceWith("/chat?resume=created%2Ffull-id");
    rerender(surface("/chat?resume=created%2Ffull-id"));
    expect(options.at(-1)?.sessionId).toBe("created/full-id");
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toContain("/hermes-agent?ui=classic&session=created%2Ffull-id");
    act(() => old("stale"));
    rerender(surface("/chat?resume=created%2Ffull-id", false));
    act(() => options.at(-1)!.onSelectSession!("parked"));
    expect(callback).toHaveBeenCalledTimes(1);
  }, LAZY_TIMEOUT);
});
