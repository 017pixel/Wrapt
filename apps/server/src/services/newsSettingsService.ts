import { type NewsSettings } from "@wrapt/contracts";
import { persistNewsSettings, readNewsSettings } from "../config/wrapt-config.js";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";

/**
 * Laufzeit-Halter des Tech-News-Schalters. Der Wert kommt aus der zentralen Config und
 * kann sich zur Laufzeit ändern (Einstellungen → Navigation), ohne dass `settings` (beim
 * Serverstart eingefroren) neu geladen werden muss. Der News-Sync liest über `get()`
 * immer den aktuellen Stand.
 */
class NewsSettingsService {
  private cached: NewsSettings | null = null;

  get(): NewsSettings {
    if (this.cached) return this.cached;
    this.cached = readNewsSettings(settings.configDirectory);
    return this.cached;
  }

  isEnabled(): boolean {
    return this.get().enabled !== false;
  }

  update(next: NewsSettings): NewsSettings {
    try {
      persistNewsSettings(settings.configDirectory, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(
        500,
        "NEWS_SETTINGS_NOT_SAVED",
        `Die Tech-News-Einstellung konnte nicht in config/wrapt.local.json gespeichert werden: ${message}`,
      );
    }
    this.cached = next;
    return next;
  }
}

export const newsSettingsService = new NewsSettingsService();
