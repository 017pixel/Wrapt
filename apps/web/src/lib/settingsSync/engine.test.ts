// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveUiSettingsRequest, UiSettingsDocument } from "@wrapt/contracts";
import { settingsSocketEventSchema } from "@wrapt/contracts";
import { useAppPreferences } from "../../stores/appPreferences";
import { createSettingsSync } from "./engine";

type FetchCall = { url: string; method: string; body: SaveUiSettingsRequest | null };

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    const list = this.listeners.get(type) ?? [];
    list.push(callback);
    this.listeners.set(type, list);
  }

  send(data: string) {
    this.sent.push(data);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  close() {
    this.emit("close", new Event("close"));
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  emitMessage(data: unknown) {
    this.emit("message", new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

const servers: UiSettingsDocument[] = [];
const syncs: Array<ReturnType<typeof createSettingsSync>> = [];
let fetchCalls: FetchCall[] = [];

function documentFor(changes?: SaveUiSettingsRequest): UiSettingsDocument {
  const current = servers.at(-1) ?? { version: 1 as const, revision: 0, updatedAt: new Date(0).toISOString(), entries: {} };
  if (!changes) return current;
  const revision = current.revision + 1;
  const now = new Date().toISOString();
  const entries = { ...current.entries };
  for (const change of changes.changes) entries[change.key] = { value: change.value, revision, updatedAt: now };
  return { version: 1, revision, updatedAt: now, entries };
}

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const changes = typeof init?.body === "string" ? JSON.parse(init.body) as SaveUiSettingsRequest : null;
    fetchCalls.push({ url, method, body: changes });
    const document = documentFor(changes ?? undefined);
    if (changes) servers.push(document);
    return new Response(JSON.stringify(document), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
}

async function flush(times = 20) {
  await vi.advanceTimersByTimeAsync(0);
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  FakeSocket.instances = [];
  servers.length = 0;
  fetchCalls = [];
  useAppPreferences.setState({ defaultPage: "dashboard", hermesV2Enabled: false });
  window.localStorage.clear();
  installFetch();
});

afterEach(() => {
  for (const sync of syncs.splice(0)) sync.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Einstellungs-Sync", () => {
  it("übernimmt den Serverstand beim Start", async () => {
    servers.push({
      version: 1,
      revision: 3,
      updatedAt: new Date().toISOString(),
      entries: {
        appPreferences: { value: { state: { defaultPage: "usage", hermesV2Enabled: true }, version: 2 }, revision: 3, updatedAt: new Date().toISOString() },
      },
    });
    const sync = createSettingsSync({ onSharedConfigChanged: () => {} });
    syncs.push(sync);
    sync.start();
    await flush();
    expect(useAppPreferences.getState().defaultPage).toBe("usage");
    expect(useAppPreferences.getState().hermesV2Enabled).toBe(true);
  });

  it("schickt lokale Änderungen gesammelt an den Server", async () => {
    const sync = createSettingsSync({ onSharedConfigChanged: () => {} });
    syncs.push(sync);
    sync.start();
    await flush();
    useAppPreferences.getState().setHermesV2Enabled(true);
    useAppPreferences.getState().setDefaultPage("settings");
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    const put = fetchCalls.find((call) => call.method === "PUT");
    expect(put?.body?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "appPreferences" }),
    ]));
    expect(put?.body?.changes).toHaveLength(1);
  });

  it("wendet Änderungen anderer Clients ohne eigenen Push an", async () => {
    const sync = createSettingsSync({ onSharedConfigChanged: () => {} });
    syncs.push(sync);
    sync.start();
    await flush();
    const socket = FakeSocket.instances[0];
    expect(socket).toBeDefined();
    socket?.emitMessage({
      type: "ui-settings.updated",
      revision: 9,
      updatedAt: new Date().toISOString(),
      clientId: "remote-client",
      entries: {
        appPreferences: {
          value: { state: { defaultPage: "workbench", hermesV2Enabled: false }, version: 2 },
          revision: 9,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    await flush();
    expect(socket?.listenerCount("message")).toBe(1);
    expect(settingsSocketEventSchema.safeParse({
      type: "ui-settings.updated",
      revision: 9,
      updatedAt: new Date().toISOString(),
      clientId: "remote-client",
      entries: {
        appPreferences: { value: { state: { defaultPage: "workbench" } }, revision: 9, updatedAt: new Date().toISOString() },
      },
    }).success).toBe(true);
    expect(useAppPreferences.getState().defaultPage).toBe("workbench");
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    expect(fetchCalls.filter((call) => call.method === "PUT")).toHaveLength(0);
  });

  it("lädt bei einem Sync-Ereignis nach einem Verbindungsaufbau neu", async () => {
    const sync = createSettingsSync({ onSharedConfigChanged: () => {} });
    syncs.push(sync);
    sync.start();
    await flush();
    servers.push({
      version: 1,
      revision: 4,
      updatedAt: new Date().toISOString(),
      entries: {
        appPreferences: { value: { state: { defaultPage: "files", hermesV2Enabled: false }, version: 2 }, revision: 4, updatedAt: new Date().toISOString() },
      },
    });
    FakeSocket.instances[0]?.emit("open", new Event("open"));
    FakeSocket.instances[0]?.emitMessage({ type: "settings.sync" });
    await flush();
    expect(useAppPreferences.getState().defaultPage).toBe("files");
  });
});
