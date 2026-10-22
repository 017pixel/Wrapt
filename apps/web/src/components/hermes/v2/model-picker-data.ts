// Reine Modellpicker-Logik: Suche, Anbietergruppen, Favoriten, Grenzen; keine Netzaufrufe.
import type {
  HermesV2ModelCatalog,
  HermesV2Selection,
} from "@wrapt/contracts/hermes-v2";

export interface ModelEntry {
  model: HermesV2ModelCatalog["providers"][number]["models"][number];
  /**
   * Ursprünglicher Anbieter des Modells. In der Favoritensektion weicht er
   * vom Anbieter der Gruppe ab: dort stehen die Modelle mehrerer Anbieter
   * zusammen, und die Auswahl muss den echten Anbieter treffen.
   */
  providerId: string;
  providerLabel: string;
  available: boolean;
}

export interface ModelGroup {
  provider: {
    id: string;
    label: string;
    available: boolean;
    /** Freitext des Anbieters, zum Beispiel ein Hinweis auf fehlende Modelle. */
    note?: string | null;
  };
  entries: ModelEntry[];
  /** Der Anbieter meldete keine Modelle und wird deshalb sichtbar benannt. */
  empty?: boolean;
  /** Eigene Sektion der markierten Modelle über den Anbietergruppen. */
  favorites?: boolean;
  /** Modelle dieses Anbieters, die erst die Suche zeigt. */
  hidden?: number;
}

/**
 * Obergrenze der angezeigten Modelle. Sie muss groß genug sein, damit kein
 * Anbieter hinter dem Limit verschwindet - der aktive Anbieter stand dadurch
 * eine Zeit lang gar nicht zur Auswahl.
 */
export const MODEL_RENDER_LIMIT = 240;

/**
 * Modelle je Anbieter ohne Suchtext. Jeder Anbieter bleibt sichtbar; die
 * übrigen Modelle erreicht man über die Suche.
 */
export const MODEL_PROVIDER_PREVIEW = 12;

/** Favoriten liegen im Gerätespeicher; der Schlüssel ist Teil des Vertrags. */
export const MODEL_FAVORITES_STORAGE_KEY = "wrapt.hermes.v2.modelFavorites";

export const FAVORITES_GROUP_ID = "favorites";
export const FAVORITES_GROUP_LABEL = "Favoriten";

export function sameSelection(
  a: HermesV2Selection | null,
  b: HermesV2Selection | null,
): boolean {
  if (!a || !b) return false;
  return a.provider === b.provider && a.model === b.model;
}

export function selectionTag(selection: HermesV2Selection): string {
  return `${selection.provider}:${selection.model}`;
}

/** Eindeutiger Schlüssel eines Modells: Anbieter und Modell getrennt. */
export function modelFavoriteKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

/** Defekter oder fremder Inhalt ergibt eine leere Liste statt eines Fehlers. */
export function parseModelFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const keys: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const key = entry.trim();
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export interface ModelFavoritesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readModelFavorites(
  storage: ModelFavoritesStorage | null | undefined,
): string[] {
  if (!storage) return [];
  try {
    return parseModelFavorites(storage.getItem(MODEL_FAVORITES_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeModelFavorites(
  storage: ModelFavoritesStorage | null | undefined,
  keys: readonly string[],
): void {
  if (!storage) return;
  try {
    storage.setItem(MODEL_FAVORITES_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Gesperrter oder voller Speicher: Favoriten bleiben für diese Sitzung gültig.
  }
}

/** Der Browserspeicher; fehlender oder blockierter Zugriff ist kein Fehler. */
export function browserModelFavoritesStorage(): ModelFavoritesStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function toggleModelFavorite(
  keys: readonly string[],
  key: string,
): string[] {
  return keys.includes(key)
    ? keys.filter((entry) => entry !== key)
    : [...keys, key];
}

export const modelsMatch = (
  entry: ModelEntry,
  group: ModelGroup,
  query: string,
): boolean => {
  if (!query) return true;
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return `${entry.model.id} ${entry.model.label} ${group.provider.label}`
    .toLocaleLowerCase()
    .includes(q);
};

export interface GroupedModelEntries {
  groups: ModelGroup[];
  rendered: number;
  total: number;
}

/**
 * Echte Anbietergruppen mit Suchwort; Renderlimit begrenzt große Kataloge.
 * Anbieter ohne gemeldete Modelle bleiben sichtbar, statt still zu verschwinden.
 * Markierte Modelle stehen als eigene Sektion über den Anbietergruppen.
 */
export function groupModelEntries(
  catalog: HermesV2ModelCatalog,
  query: string,
  favorites: readonly string[] = [],
): GroupedModelEntries {
  const q = query.trim().toLocaleLowerCase();
  const favoriteKeys = new Set(favorites);
  const groups: ModelGroup[] = [];
  const favoriteEntries: ModelEntry[] = [];
  // Zahl aller passenden Modelle, auch der zunächst verdeckten. Die Anzeige
  // nennt damit ehrlich, wie viel die Suche zusätzlich findet.
  let matched = 0;
  for (const provider of catalog.providers) {
    const entries = provider.models
      .filter(
        (model) =>
          !q ||
          `${model.id} ${model.label} ${provider.label}`
            .toLocaleLowerCase()
            .includes(q),
      )
      .map((model) => ({
        model,
        providerId: provider.id,
        providerLabel: provider.label,
        available: provider.available,
      }));
    matched += entries.length;
    for (const entry of entries) {
      const key = modelFavoriteKey(provider.id, entry.model.id);
      if (favoriteKeys.has(key)) favoriteEntries.push(entry);
    }
    // Ohne Suchtext zeigt jede Gruppe eine Vorschau; die Gruppe selbst bleibt
    // sichtbar, damit kein Anbieter aus dem Katalog verschwindet.
    const shown = q ? entries : entries.slice(0, MODEL_PROVIDER_PREVIEW);
    const group: ModelGroup = {
      provider: {
        id: provider.id,
        label: provider.label,
        available: provider.available,
        note: provider.note ?? null,
      },
      entries: shown,
      ...(entries.length > shown.length
        ? { hidden: entries.length - shown.length }
        : {}),
    };
    if (shown.length > 0) groups.push(group);
    else if (provider.models.length === 0) groups.push({ ...group, empty: true });
  }
  const limited = limitGroups(groups);
  const favoritesGroup: ModelGroup | null =
    favoriteEntries.length > 0
      ? {
          provider: {
            id: FAVORITES_GROUP_ID,
            label: FAVORITES_GROUP_LABEL,
            available: true,
          },
          entries: favoriteEntries,
          favorites: true,
        }
      : null;
  return {
    groups: favoritesGroup ? [favoritesGroup, ...limited.groups] : limited.groups,
    rendered: limited.rendered,
    total: matched,
  };
}

function countModels(groups: readonly ModelGroup[]): number {
  return groups.reduce((sum, group) => sum + group.entries.length, 0);
}

/**
 * Begrenzte Sichtbarkeit bleibt suchbar, weil die Suche die Menge erst einschnürt.
 * Kein Anbieter fällt dabei ganz weg: jeder behält mindestens einen Eintrag.
 */
export function limitGroups(groups: ModelGroup[]): GroupedModelEntries {
  const total = countModels(groups);
  const capped: ModelGroup[] = [];
  let remaining = MODEL_RENDER_LIMIT;
  for (const group of groups) {
    if (group.entries.length === 0) {
      capped.push(group);
      continue;
    }
    const size =
      remaining >= group.entries.length
        ? group.entries.length
        : Math.max(1, Math.min(group.entries.length, remaining));
    remaining -= size;
    capped.push(
      size === group.entries.length
        ? group
        : { ...group, entries: group.entries.slice(0, size) },
    );
  }
  return { groups: capped, rendered: countModels(capped), total };
}

/** capabilities sind Modellsache: canDisableReasoning nur der konkreten Auswahl. */
export function canDisableReasoningFor(
  catalog: HermesV2ModelCatalog | null,
  selection: HermesV2Selection | null,
): boolean | null {
  if (!catalog || !selection) return null;
  const provider = catalog.providers.find(
    (candidate) => candidate.id === selection.provider,
  );
  const model = provider?.models.find(
    (candidate) => candidate.id === selection.model,
  );
  return model?.canDisableReasoning ?? null;
}
