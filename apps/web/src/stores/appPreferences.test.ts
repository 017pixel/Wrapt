// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageRouteId } from "./sidebarPreferences";

/**
 * Der Store cached seine localStorage-Referenz beim Import. Damit die
 * Persistierung getestet werden kann, wird die Umgebung zuerst präpariert und
 * der Store danach dynamisch importiert.
 */

const STORAGE_KEY = "wrapt.app-preferences.v1";

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, value); },
  } as Storage;
}

const storage = memoryStorage();
Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
vi.stubGlobal("localStorage", storage);

type AppPreferencesState = {
  defaultPage: PageRouteId;
  hermesV2Enabled: boolean;
  setDefaultPage: (page: PageRouteId) => void;
  setHermesV2Enabled: (enabled: boolean) => void;
};

type AppPreferencesModule = {
  subscribeAppPreferencesStorage: () => () => void;
  useAppPreferences: {
    getState: () => AppPreferencesState;
    setState: (partial: Partial<AppPreferencesState>) => void;
    persist: { rehydrate: () => void | Promise<void> };
  };
};

let appPreferences: AppPreferencesModule;

beforeEach(async () => {
  storage.clear();
  appPreferences = await import("./appPreferences");
  appPreferences.useAppPreferences.setState({ defaultPage: "dashboard", hermesV2Enabled: false });
});

afterEach(() => {
  vi.resetModules();
});

function storedState(): Record<string, unknown> | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
}

describe("app preferences", () => {
  it("setzt eine verfügbare Standardseite und persistiert sie", () => {
    appPreferences.useAppPreferences.getState().setDefaultPage("workbench");
    expect(appPreferences.useAppPreferences.getState().defaultPage).toBe("workbench");
    expect(storedState()?.defaultPage).toBe("workbench");
  });

  it("setzt eine entfernte Inbox-Standardseite auf das Dashboard zurück", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { defaultPage: "inbox" }, version: 1 }));
    appPreferences.useAppPreferences.persist.rehydrate();
    expect(appPreferences.useAppPreferences.getState().defaultPage).toBe("dashboard");
  });

  it("migriert v1 und erhält die gewählte Startseite bei standardmäßig deaktiviertem V2", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { defaultPage: "workbench" }, version: 1 }));
    appPreferences.useAppPreferences.persist.rehydrate();
    expect(appPreferences.useAppPreferences.getState()).toMatchObject({ defaultPage: "workbench", hermesV2Enabled: false });
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(3);
  });

  it("persistiert die V2-Auswahl und lädt sie nach einem Refresh", () => {
    appPreferences.useAppPreferences.getState().setHermesV2Enabled(true);
    const saved = storage.getItem(STORAGE_KEY)!;
    expect(storedState()?.hermesV2Enabled).toBe(true);
    appPreferences.useAppPreferences.setState({ hermesV2Enabled: false });
    storage.setItem(STORAGE_KEY, saved);
    appPreferences.useAppPreferences.persist.rehydrate();
    expect(appPreferences.useAppPreferences.getState().hermesV2Enabled).toBe(true);
  });

  it.each([undefined, null, "true", 1, {}, []])("aktiviert V2 nicht durch den ungültigen Wert %j", (value) => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { hermesV2Enabled: value }, version: 2 }));
    appPreferences.useAppPreferences.persist.rehydrate();
    expect(appPreferences.useAppPreferences.getState().hermesV2Enabled).toBe(false);
  });

  it("deaktiviert V2 bei beschädigten Präferenzdaten", () => {
    appPreferences.useAppPreferences.getState().setHermesV2Enabled(true);
    storage.setItem(STORAGE_KEY, "{unvollständig");
    appPreferences.useAppPreferences.persist.rehydrate();
    expect(appPreferences.useAppPreferences.getState().hermesV2Enabled).toBe(false);
  });

  it("übernimmt fremde Änderungen ohne Schreibecho und entfernt den Listener", () => {
    const stop = appPreferences.subscribeAppPreferencesStorage();
    const writes = vi.spyOn(storage, "setItem");
    const emit = (key: string | null) => window.dispatchEvent(Object.assign(new Event("storage"), { key }));
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { defaultPage: "workbench", hermesV2Enabled: true }, version: 2 }));
    writes.mockClear();
    emit("anderer-key");
    expect(appPreferences.useAppPreferences.getState().hermesV2Enabled).toBe(false);
    emit(STORAGE_KEY);
    expect(appPreferences.useAppPreferences.getState()).toMatchObject({ defaultPage: "workbench", hermesV2Enabled: true });
    expect(writes).not.toHaveBeenCalled();
    stop();
    storage.clear();
    emit(null);
    expect(appPreferences.useAppPreferences.getState().hermesV2Enabled).toBe(true);
    writes.mockRestore();
  });

  it("setzt V2 und Startseite beim Löschen des Speichers in einem anderen Tab zurück", () => {
    const stop = appPreferences.subscribeAppPreferencesStorage();
    appPreferences.useAppPreferences.getState().setHermesV2Enabled(true);
    storage.clear();
    window.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
    expect(appPreferences.useAppPreferences.getState()).toMatchObject({ defaultPage: "dashboard", hermesV2Enabled: false });
    stop();
  });

  it("erzeugt auch bei einer alten Datenversion aus einem anderen Tab kein Schreibecho", () => {
    const stop = appPreferences.subscribeAppPreferencesStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { defaultPage: "workbench" }, version: 1 }));
    const writes = vi.spyOn(storage, "setItem");
    window.dispatchEvent(Object.assign(new Event("storage"), { key: STORAGE_KEY }));
    expect(appPreferences.useAppPreferences.getState()).toMatchObject({ defaultPage: "workbench", hermesV2Enabled: false });
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
    stop();
  });
});
