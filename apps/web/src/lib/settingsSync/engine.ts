import {
  settingsSocketEventSchema,
  sharedConfigSettingKeys,
  type SharedConfigSettingKey,
  type UiSettingEntry,
  type UiSettingKey,
  type UiSettingValue,
} from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../apiClient";
import { settingsAdaptersByKey, type SettingsAdapter } from "./adapters";
import { readMeta, serializeSetting, writeMeta } from "./meta";

const PUSH_DELAY_MS = 400;
const POLL_INTERVAL_MS = 45_000;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

interface PendingChange {
  value: UiSettingValue;
  serialized: string;
}

export interface SettingsSyncOptions {
  onSharedConfigChanged(keys: SharedConfigSettingKey[]): void;
}

/**
 * Hält die clientweiten Einstellungen mit dem Server und den übrigen Clients
 * synchron. Der lokale Speicher bleibt schnelle Erstquelle; der Server ist die
 * gemeinsame Quelle für alle Geräte.
 */
export function createSettingsSync(options: SettingsSyncOptions) {
  const clientId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const meta = readMeta();
  const known = new Map<UiSettingKey, string>();
  const pending = new Map<UiSettingKey, PendingChange>();
  const applying = new Set<UiSettingKey>();
  const subscriptions: Array<() => void> = [];

  let started = false;
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = 1_000;
  let pushTimer: number | null = null;
  let syncRetryTimer: number | null = null;
  let retryDelay = RETRY_MIN_MS;
  let pollTimer: number | null = null;
  let syncing = false;
  let pushing = false;
  let pushBlocked = false;
  let syncedOnce = false;
  let applyChain: Promise<void> = Promise.resolve();

  for (const key of settingsAdaptersByKey.keys()) {
    const adapter = settingsAdaptersByKey.get(key);
    if (!adapter) continue;
    const serialized = serializeSetting(adapter.read());
    known.set(key, serialized);
    if (meta.pending[key] !== undefined) pending.set(key, { value: adapter.read(), serialized });
  }

  const persistMeta = () => {
    meta.pending = {};
    for (const key of pending.keys()) meta.pending[key] = Date.now();
    writeMeta(meta);
  };

  const markPending = (key: UiSettingKey, adapter: SettingsAdapter) => {
    const value = adapter.read();
    const serialized = serializeSetting(value);
    if (serialized === known.get(key)) return;
    known.set(key, serialized);
    pending.set(key, { value, serialized });
    persistMeta();
    schedulePush(PUSH_DELAY_MS);
  };

  const applyRemote = (key: UiSettingKey, entry: UiSettingEntry): Promise<void> => {
    applyChain = applyChain.then(async () => {
      const adapter = settingsAdaptersByKey.get(key);
      if (!adapter) return;
      const serialized = serializeSetting(entry.value);
      if (serializeSetting(adapter.read()) !== serialized) {
        applying.add(key);
        try {
          await adapter.apply(entry.value);
        } finally {
          applying.delete(key);
        }
      }
      const afterApply = serializeSetting(adapter.read());
      known.set(key, afterApply);
      meta.revisions[key] = entry.revision;
      if (afterApply !== serialized) {
        // Eine lokale Änderung fiel genau in das Anwenden des Serverwerts.
        // Sie bleibt als letzte Nutzeraktion erhalten und wird nachgereicht.
        pending.set(key, { value: adapter.read(), serialized: afterApply });
      } else {
        delete meta.pending[key];
      }
      persistMeta();
    }).catch(() => {
      // Ein fehlerhaftes Adapter-Update darf die Kette für alle weiteren
      // Schlüssel nicht dauerhaft blockieren.
    });
    return applyChain;
  };

  const clearSavedPending = (key: UiSettingKey, serialized: string) => {
    const current = pending.get(key);
    if (current && current.serialized !== serialized) return;
    pending.delete(key);
    delete meta.pending[key];
  };

  const syncFromServer = async (): Promise<void> => {
    if (syncing || stopped) return;
    syncing = true;
    try {
      const document = await apiClient.uiSettings();
      for (const key of settingsAdaptersByKey.keys()) {
        const adapter = settingsAdaptersByKey.get(key);
        if (!adapter) continue;
        const entry = document.entries[key];
        const serialized = serializeSetting(adapter.read());
        if (!known.has(key)) known.set(key, serialized);
        if (!entry) {
          // Erster Start nach dem Update: vorhandene lokale Einstellungen
          // einmalig auf den Server heben, damit andere Clients sie erhalten.
          if (adapter.hasLocalValue() && !pending.has(key)) {
            pending.set(key, { value: adapter.read(), serialized: serializeSetting(adapter.read()) });
            persistMeta();
          }
          continue;
        }
        const localRevision = meta.revisions[key] ?? -1;
        const isPending = pending.has(key) || meta.pending[key] !== undefined;
        if (isPending) {
          if (serializeSetting(entry.value) === serialized) {
            clearSavedPending(key, serialized);
            meta.revisions[key] = entry.revision;
          } else {
            meta.revisions[key] = entry.revision;
          }
          continue;
        }
        if (entry.revision <= localRevision) {
          // Lokal geänderter Wert, dessen Revisionsmarke verloren ging: Der
          // lokale Stand ist die letzte Nutzeraktion und wird nachgereicht.
          if (serializeSetting(entry.value) !== serialized) {
            pending.set(key, { value: adapter.read(), serialized });
          }
          continue;
        }
        if (serializeSetting(entry.value) === serialized) {
          meta.revisions[key] = entry.revision;
          known.set(key, serialized);
          continue;
        }
        await applyRemote(key, entry);
      }
      persistMeta();
      if (pending.size > 0) schedulePush(PUSH_DELAY_MS);
      // Ohne offenen WebSocket ist der Poll die einzige Chance, serverweite
      // Config-Änderungen anderer Clients mitzubekommen. Beim allerersten
      // Laden sind die Queries ohnehin frisch.
      if (syncedOnce && socket?.readyState !== 1) options.onSharedConfigChanged([...sharedConfigSettingKeys]);
      syncedOnce = true;
    } catch {
      if (syncRetryTimer === null) {
        syncRetryTimer = window.setTimeout(() => {
          syncRetryTimer = null;
          void syncFromServer();
        }, 5_000);
      }
    } finally {
      syncing = false;
    }
  };

  function schedulePush(delay: number): void {
    if (pushTimer !== null) window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => {
      pushTimer = null;
      void pushPending();
    }, delay);
  }

  const pushPending = async (): Promise<void> => {
    if (pushing || pushBlocked || pending.size === 0 || stopped) return;
    pushing = true;
    const batch = [...pending.entries()];
    const sent = new Map(batch.map(([key, change]) => [key, change.serialized]));
    try {
      const response = await apiClient.saveUiSettings({
        clientId,
        changes: batch.map(([key, change]) => ({ key, value: change.value })),
      });
      if (!response) throw new Error("Antwort fehlt");
      for (const [key, serialized] of sent) {
        clearSavedPending(key, serialized);
        const entry = response.entries[key];
        if (entry) meta.revisions[key] = entry.revision;
      }
      retryDelay = RETRY_MIN_MS;
      persistMeta();
    } catch (error) {
      // 4xx (außer einem erwartbaren Konflikt) wird durch Wiederholen nicht besser.
      // Der lokale Wert bleibt erhalten; der nächste Seitenaufruf versucht es erneut.
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        pushBlocked = true;
      } else {
        schedulePush(retryDelay);
        retryDelay = Math.min(RETRY_MAX_MS, retryDelay * 2);
      }
    } finally {
      pushing = false;
      if (!pushBlocked && pending.size > 0 && pushTimer === null) schedulePush(PUSH_DELAY_MS);
    }
  };

  const scheduleReconnect = (delay: number): void => {
    if (stopped || reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const handleSocketMessage = (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const event = settingsSocketEventSchema.safeParse(parsed);
    if (!event.success) return;
    if (event.data.type === "settings.sync") {
      options.onSharedConfigChanged([...sharedConfigSettingKeys]);
      void syncFromServer();
      return;
    }
    if (event.data.type === "settings.config-changed") {
      options.onSharedConfigChanged(event.data.keys);
      return;
    }
    if (event.data.clientId === clientId) return;
    for (const [key, entry] of Object.entries(event.data.entries)) {
      if (!entry || pending.has(key as UiSettingKey)) continue;
      if (entry.revision <= (meta.revisions[key as UiSettingKey] ?? -1)) continue;
      void applyRemote(key as UiSettingKey, entry);
    }
  };

  function connect(): void {
    if (stopped) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const nextSocket = new WebSocket(`${protocol}//${window.location.host}/api/v1/settings/ws`);
    socket = nextSocket;
    nextSocket.addEventListener("open", () => {
      reconnectDelay = 1_000;
    });
    nextSocket.addEventListener("message", (event) => {
      if (typeof event.data === "string") handleSocketMessage(event.data);
    });
    nextSocket.addEventListener("close", () => {
      if (socket === nextSocket) socket = null;
      if (stopped) return;
      scheduleReconnect(reconnectDelay);
      reconnectDelay = Math.min(30_000, reconnectDelay * 2);
    });
    nextSocket.addEventListener("error", () => nextSocket.close());
  }

  const handleStorage = (event: StorageEvent) => {
    if (stopped || event.key === null) return;
    for (const [key, adapter] of settingsAdaptersByKey) {
      if (event.key !== adapter.storageKey) continue;
      if (event.newValue === null) return;
      try {
        const value = JSON.parse(event.newValue) as UiSettingValue;
        known.set(key, serializeSetting(value));
        if (!applying.has(key)) {
          applying.add(key);
          void Promise.resolve(adapter.apply(value))
            .then(() => { if (!pending.has(key)) known.set(key, serializeSetting(adapter.read())); })
            .finally(() => applying.delete(key));
        }
      } catch {
        // Fremde oder beschädigte Speicherwerte ignorieren.
      }
      return;
    }
  };

  const flushKeepalive = () => {
    if (pending.size === 0) return;
    const body = JSON.stringify({
      clientId,
      changes: [...pending.entries()].map(([key, change]) => ({ key, value: change.value })),
    });
    if (body.length > 60_000 || new TextEncoder().encode(body).length > 60_000) return;
    try {
      void fetch("/api/v1/settings/ui", {
        method: "PUT",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      }).catch(() => undefined);
    } catch {
      // Der nächste Start gleicht über die gespeicherte Markierung ab.
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === "visible") void syncFromServer();
  };

  return {
    start() {
      if (started) return;
      started = true;
      stopped = false;
      for (const [key, adapter] of settingsAdaptersByKey) {
        known.set(key, serializeSetting(adapter.read()));
        subscriptions.push(adapter.subscribe(() => {
          if (applying.has(key)) return;
          markPending(key, adapter);
        }));
      }
      window.addEventListener("storage", handleStorage);
      window.addEventListener("pagehide", flushKeepalive);
      document.addEventListener("visibilitychange", handleVisibility);
      pollTimer = window.setInterval(() => void syncFromServer(), POLL_INTERVAL_MS);
      void syncFromServer();
      connect();
    },
    stop() {
      if (!started) return;
      stopped = true;
      started = false;
      for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pagehide", flushKeepalive);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (pushTimer !== null) window.clearTimeout(pushTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (syncRetryTimer !== null) window.clearTimeout(syncRetryTimer);
      pollTimer = null;
      pushTimer = null;
      reconnectTimer = null;
      syncRetryTimer = null;
      socket?.close();
      socket = null;
    },
  };
}

export type SettingsSync = ReturnType<typeof createSettingsSync>;
