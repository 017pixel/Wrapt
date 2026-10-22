import type {
  SharedConfigSettingKey,
  UiSettingEntry,
  UiSettingKey,
} from "@wrapt/contracts";

export interface UiSettingsUpdatedMessage {
  type: "ui-settings.updated";
  ownerId: string;
  revision: number;
  updatedAt: string;
  clientId: string;
  entries: Partial<Record<UiSettingKey, UiSettingEntry>>;
}

export interface SharedConfigChangedMessage {
  type: "settings.config-changed";
  keys: SharedConfigSettingKey[];
}

export type SettingsEventMessage = UiSettingsUpdatedMessage | SharedConfigChangedMessage;

type Listener = (event: SettingsEventMessage) => void;

/**
 * Prozessinterner Verteiler für Einstellungsänderungen. Der WebSocket-
 * Endpunkt filtert die Client-Einstellungen nach Eigentümer; serverweite
 * Config-Änderungen gehen an alle verbundenen Clients.
 */
class SettingsEventHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publishUiSettings(message: UiSettingsUpdatedMessage): void {
    this.emit(message);
  }

  publishConfig(keys: SharedConfigSettingKey[]): void {
    if (keys.length === 0) return;
    this.emit({ type: "settings.config-changed", keys: [...new Set(keys)] });
  }

  private emit(message: SettingsEventMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        // Ein geschlossener Socket darf die übrigen Empfänger nicht blockieren.
      }
    }
  }
}

export const settingsEvents = new SettingsEventHub();

/** Meldet eine Änderung an einer serverweiten Config-Einstellung. */
export function notifySharedConfigChanged(...keys: SharedConfigSettingKey[]): void {
  settingsEvents.publishConfig(keys);
}
