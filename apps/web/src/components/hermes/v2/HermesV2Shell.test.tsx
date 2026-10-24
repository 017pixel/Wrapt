// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubHermesViewport } from "../../../test/hermesViewport";
import { useAppPreferences } from "../../../stores/appPreferences";
import { HermesV2Shell } from "./HermesV2Shell";
import type {
  HermesV2Chat,
  HermesV2ChatOptions,
  UseHermesV2Chat,
} from "./chat-types";
import { emptyChatComposer } from "./chat-composer-types";
import { emptyChatWork } from "./chat-work-types";

const setDraft = vi.fn();
const submit = vi.fn();
const chatFixture: HermesV2Chat = {
  connection: { state: "online", attempt: 0, error: null },
  sessions: { items: [], loading: false, hasMore: false, error: null },
  activeSnapshot: null,
  draft: "",
  submitting: false,
  actionError: null,
  unknownSend: null,
  requestStates: [],
  composer: emptyChatComposer,
  work: emptyChatWork,
  refreshWork: vi.fn().mockResolvedValue(undefined),
  interruptSubagent: vi.fn().mockResolvedValue(undefined),
  readSubagentTail: vi.fn().mockResolvedValue(undefined),
  killProcess: vi.fn().mockResolvedValue(undefined),
  startBackground: vi.fn().mockResolvedValue(undefined),
  startBtw: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
  selectReasoning: vi.fn().mockResolvedValue(undefined),
  setApprovalMode: vi.fn().mockResolvedValue(undefined),
  uploadAttachment: vi.fn().mockResolvedValue(undefined),
  removeAttachment: vi.fn(),
  checkUpload: vi.fn().mockResolvedValue(undefined),
  cancelModelSelection: vi.fn(),
  setDraft,
  selectSession: vi.fn(),
  refreshSessions: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue("neu"),
  submit,
  stop: vi.fn().mockResolvedValue(undefined),
  steer: vi.fn().mockResolvedValue(undefined),
  loadOlder: vi.fn().mockResolvedValue(undefined),
  readCatalog: vi.fn().mockResolvedValue(undefined),
  selectModel: vi.fn().mockResolvedValue(undefined),
  respond: vi.fn().mockResolvedValue(undefined),
  lockRequest: vi.fn().mockResolvedValue(undefined),
  resync: vi.fn().mockResolvedValue(undefined),
  resendUnknown: vi.fn().mockResolvedValue(undefined),
  continueWithoutResend: vi.fn().mockResolvedValue(undefined),
  reconnect: vi.fn(),
  clearError: vi.fn(),
};

const calls: HermesV2ChatOptions[] = [];

const hookOptions = (index: number): HermesV2ChatOptions =>
  calls[index] ?? {
    ownerId: "",
    sessionId: null,
    onSelectSession: () => undefined,
  };

vi.mock("./useHermesV2Chat", () => ({
  useHermesV2Chat: ((options: HermesV2ChatOptions) => {
    calls.push(options);
    return chatFixture;
  }) as unknown as UseHermesV2Chat,
}));

vi.mock("./useHermesV2Sidebar", async () => {
  const { makeSidebar } = await import("./sidebar-test-fixtures");
  return { useHermesV2Sidebar: () => makeSidebar() };
});

const surfaceProps: Record<string, unknown>[] = [];

vi.mock("./HermesV2ChatSurface", async () => {
  const actual = await import("./HermesV2ChatSurface");
  return {
    HermesV2ChatSurface: (props: Record<string, unknown>) => {
      surfaceProps.push(props);
      return actual.HermesV2ChatSurface(props as never);
    },
  };
});

function renderShell(entry: string | undefined, standalone: boolean) {
  return render(
    <MemoryRouter initialEntries={entry ? [entry] : ["/hermes-v2"]}>
      <HermesV2Shell variant="route" standalone={standalone} />
    </MemoryRouter>,
  );
}

function countV2Markers(container: HTMLElement): number {
  return container.querySelectorAll("[data-hermes-ui='v2']").length;
}

describe("HermesV2Shell", () => {
  beforeEach(() => {
    stubHermesViewport();
    window.localStorage.clear();
    useAppPreferences.setState({ hermesV2Enabled: false });
    calls.length = 0;
    surfaceProps.length = 0;
    chatFixture.draft = "";
    setDraft.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("zeigt bei ausgeschaltetem Flag nur die Aktivierungskarte und keine Chatfläche", () => {
    const { container } = renderShell(undefined, false);
    const switchControl = screen.getByRole("switch", {
      name: /Hermes V2 aktivieren/,
    });
    expect(switchControl.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector("[data-hermes-ui='v2']")).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Nachricht an Hermes" }),
    ).toBeNull();
  });

  it("aktiviert über die Karte und zeigt danach die echte Chatfläche", () => {
    const { container } = renderShell(undefined, false);
    fireEvent.click(
      screen.getByRole("switch", { name: /Hermes V2 aktivieren/ }),
    );
    expect(useAppPreferences.getState().hermesV2Enabled).toBe(true);
    expect(container.querySelector(".hermesv2-chat-body")).toBeTruthy();
    // Die Chatfläche startet keinen neuen Chat mehr selbst, das gehört in
    // die Seitenleiste.
    expect(screen.queryByRole("button", { name: /neuen chat starten/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hermes-Optionen" }));
    expect(
      screen.getByRole("menuitem", { name: "Klassische Oberfläche" }),
    ).toBeTruthy();
  });

  it("übergibt stabile Owner-, Auswahl- und Rückrufverträge an den Hook", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    renderShell("/hermes-v2?session=ordner/id", false);
    expect(calls).toHaveLength(1);
    expect(hookOptions(0).ownerId).toBe("hermes-route");
    expect(hookOptions(0).sessionId).toBe("ordner/id");
    expect(typeof hookOptions(0).onSelectSession).toBe("function");
    expect(hookOptions(0).active).toBe(true);
  });

  it("setzt genau ein data-hermes-ui=v2 und übernimmt die Session in die Fensterlinks", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    const { container } = renderShell("/hermes-v2?session=ordner/id", false);
    expect(countV2Markers(container)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Hermes-Optionen" }));
    const link = screen.getByRole("menuitem", { name: "Klassische Oberfläche" });
    expect(link.getAttribute("href")).toBe(
      "/hermes-agent?ui=classic&session=ordner%2Fid",
    );
    const windowLink = screen.getByRole("menuitem", {
      name: "In eigenem Fenster öffnen",
    });
    expect(windowLink.getAttribute("href")).toContain(
      "/hermes-v2/standalone?session=ordner%2Fid",
    );
    expect(windowLink.getAttribute("target")).toBe("_blank");
    expect(windowLink.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("lässt auf mobilen Breiten den Chat sichtbar und den Drawer zugeklappt", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    const { container } = renderShell(undefined, false);
    const sidebar = container.querySelector(".hermesv2-sidebar") as HTMLElement;
    expect(sidebar.getAttribute("data-drawer-open")).toBe("false");
    expect(sidebar.getAttribute("aria-hidden")).toBe("true");
    expect(sidebar.parentElement?.hasAttribute("inert")).toBe(true);
    const toggle = screen.getByRole("button", { name: "Sitzungen" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(
      (container.querySelector(".hermesv2-sidebar") as HTMLElement).id,
    );
    expect(
      container.querySelector(".hermesv2-chat-body"),
    ).toBeTruthy();
  });

  it("öffnet und schließt den Drawer über Toggle, Backdrop und Escape", async () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    const { container } = renderShell(undefined, false);
    const toggle = screen.getByRole("button", { name: "Sitzungen" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      (
        container.querySelector(".hermesv2-sidebar") as HTMLElement
      ).getAttribute("data-drawer-open"),
    ).toBe("true");
    const close = screen.getByRole("button", {
      name: "Sitzungsspalte schließen",
    });
    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(
        (
          container.querySelector(".hermesv2-sidebar") as HTMLElement
        ).getAttribute("data-drawer-open"),
      ).toBe("false");
    });
    await waitFor(() => expect(document.activeElement).toBe(toggle));
    fireEvent.click(toggle);
    fireEvent.pointerDown(
      container.querySelector(".hermesv2-drawer-backdrop") as HTMLDivElement,
    );
    expect(
      (
        container.querySelector(".hermesv2-sidebar") as HTMLElement
      ).getAttribute("data-drawer-open"),
    ).toBe("false");
  });

  it("klappt die breite Sitzungsspalte ein und nimmt sie aus der Bedienung", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    stubHermesViewport(1280, 900);
    const { container } = renderShell(undefined, false);
    const toggle = screen.getByRole("button", { name: "Sitzungen" });
    const layer = container.querySelector(".hermesv2-drawer-layer");
    const sidebar = container.querySelector(".hermesv2-sidebar");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(layer?.hasAttribute("inert")).toBe(false);

    fireEvent.click(toggle);
    expect(
      container.querySelector(".hermesv2")?.classList.contains(
        "is-sidebar-collapsed",
      ),
    ).toBe(true);
    expect(sidebar?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.hasAttribute("inert")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(
      container.querySelector(".hermesv2")?.classList.contains(
        "is-sidebar-collapsed",
      ),
    ).toBe(false);
    expect(sidebar?.getAttribute("aria-hidden")).toBeNull();
    expect(layer?.hasAttribute("inert")).toBe(false);
  });

  it("hält die kompakte Standalone-Toolbar und den Workbench-Rücklink bereit", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    const { container } = renderShell(
      "/hermes-v2/standalone?session=demo",
      true,
    );
    expect(countV2Markers(container)).toBe(1);
    expect(container.querySelector(".hermesv2-toolbar")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hermes", level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sitzungen" }));
    expect(screen.getByRole("link", { name: /Zur Workbench/ })).toBeTruthy();
  });

  it("liest bei aktivem Chat, aber nicht bei offenem Neue-Sitzung-Dialog", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    // Breite Ansicht: die Seitenleiste steht offen, dort startet ein Chat.
    stubHermesViewport(1280, 900);
    const { container } = renderShell(undefined, false);
    const readActive = () => surfaceProps.at(-1)?.readActive;
    expect(readActive()).toBe(true);
    // Die Kopfleiste kennt keinen Knopf für einen neuen Chat.
    const header = container.querySelector(".hermesv2-toolbar") as HTMLElement;
    expect(
      within(header).queryByRole("button", { name: /neuer chat|neue sitzung/i }),
    ).toBeNull();
    // Modaler Dialog liegt über dem Chat: darunter neu eintreffende
    // Antworten dürfen nicht automatisch bestätigt werden.
    const sidebar = container.querySelector(".hermesv2-sidebar") as HTMLElement;
    fireEvent.click(
      within(sidebar).getByRole("button", { name: /neuer chat|neue sitzung/i }),
    );
    expect(screen.getByRole("dialog", { name: "Neue Sitzung" })).toBeTruthy();
    expect(readActive()).toBe(false);
  });
});
