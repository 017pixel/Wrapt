// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPreferences, NotificationSettingsResponse } from "@wrapt/contracts";
import { wraptQueries } from "../../lib/queryOptions";
import { SettingsNotifications } from "./SettingsNotifications";

const mocks = vi.hoisted(() => ({
  notificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  test: vi.fn(),
}));

vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    notificationSettings: mocks.notificationSettings,
    saveNotificationSettings: mocks.saveNotificationSettings,
  },
}));

vi.mock("../../lib/useWebPushDevice", () => ({
  useWebPushDevice: () => ({
    device: { status: "active-synced", permission: "granted", endpoint: "https://push.example/device", message: "Dieses Gerät ist registriert." },
    working: false,
    actionMessage: "",
    activate: mocks.activate,
    deactivate: mocks.deactivate,
    test: mocks.test,
  }),
}));

function settings(preferences: NotificationPreferences): NotificationSettingsResponse {
  return { preferences, pushSupported: true, vapidPublicKey: "public-key", subscriptionCount: 1, serverPushEnabled: true };
}

function preferences(pushEnabled = true): NotificationPreferences {
  return {
    pushEnabled,
    sources: {
      hermes: { push: false }, t3: { push: true }, opencode: { push: false },
      codex: { push: false }, claude: { push: false }, terminal: { push: false },
      wrapt: { push: true }, workbench: { push: true }, update: { push: false },
    },
  };
}

let client: QueryClient;

function renderSettings(initialPreferences = preferences()) {
  const initial = settings(initialPreferences);
  mocks.notificationSettings.mockResolvedValue(initial);
  client.setQueryData(wraptQueries.notificationSettings().queryKey, initial);
  return render(<QueryClientProvider client={client}><SettingsNotifications /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mocks.saveNotificationSettings.mockImplementation(async (preferences: NotificationPreferences) => settings(preferences));
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("Push-Einstellungen", () => {
  it("aktiviert Quellen über den globalen Schalter und erhält das bestehende Geräte-Abo", async () => {
    const initialPreferences = preferences(false);
    renderSettings(initialPreferences);
    const source = screen.getByRole("button", { name: "T3 Code Push" }) as HTMLButtonElement;
    expect(source.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Auf diesem Gerät deaktivieren" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Testbenachrichtigung an dieses Gerät senden" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Server-Push für wichtige Ereignisse/ }));
    await waitFor(() => expect(source.disabled).toBe(false));
    expect(mocks.saveNotificationSettings).toHaveBeenCalledExactlyOnceWith({ ...initialPreferences, pushEnabled: true });
    expect(within(source).getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(mocks.deactivate).not.toHaveBeenCalled();
  });

  it("speichert eine Quellenauswahl und behält die übrigen Push-Präferenzen", async () => {
    const initialPreferences = preferences();
    renderSettings(initialPreferences);
    const source = screen.getByRole("button", { name: "T3 Code Push" });
    fireEvent.click(source);

    await waitFor(() => expect(within(source).getByRole("switch").getAttribute("aria-checked")).toBe("false"));
    expect(mocks.saveNotificationSettings).toHaveBeenCalledExactlyOnceWith({
      ...initialPreferences,
      sources: { ...initialPreferences.sources, t3: { push: false } },
    });
    expect(within(screen.getByRole("button", { name: "Wrapt Push" })).getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("behält nach einem Speicherfehler die Auswahl und erlaubt einen erneuten Versuch", async () => {
    mocks.saveNotificationSettings.mockRejectedValueOnce(new Error("offline"));
    renderSettings();
    const source = screen.getByRole("button", { name: "T3 Code Push" }) as HTMLButtonElement;
    fireEvent.click(source);

    expect((await screen.findByRole("status")).textContent).toBe("Die Benachrichtigungseinstellungen konnten nicht gespeichert werden.");
    expect(within(source).getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(source.disabled).toBe(false);

    fireEvent.click(source);
    await waitFor(() => expect(within(source).getByRole("switch").getAttribute("aria-checked")).toBe("false"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.saveNotificationSettings).toHaveBeenCalledTimes(2);
  });
});
