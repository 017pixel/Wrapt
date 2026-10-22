// UItests der reinen Modellpicker-Logik: Favoriten im Speicher, Anbietergruppen.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { HermesV2ModelCatalog } from "@wrapt/contracts/hermes-v2";
import {
  browserModelFavoritesStorage,
  groupModelEntries,
  modelFavoriteKey,
  parseModelFavorites,
  readModelFavorites,
  toggleModelFavorite,
  writeModelFavorites,
  MODEL_FAVORITES_STORAGE_KEY,
  MODEL_PROVIDER_PREVIEW,
  type ModelFavoritesStorage,
} from "./model-picker-data";

const model = (id: string) => ({
  id,
  label: id,
  reasoningEfforts: [],
  fast: false,
  priceInput: null,
  priceOutput: null,
});

const catalog: HermesV2ModelCatalog = {
  providers: [
    {
      id: "p1",
      label: "Anbieter Eins",
      available: true,
      models: [model("m1"), model("m2")],
    },
    {
      id: "p2",
      label: "Anbieter Zwei",
      available: true,
      models: [],
    },
  ],
  current: { provider: "p1", model: "m1" },
};

function memoryStorage(initial: Record<string, string> = {}): ModelFavoritesStorage & {
  values: Record<string, string>;
} {
  const values = { ...initial };
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

describe("model-picker-data Favoriten", () => {
  it("liest nur eine Liste von Schlüsseln", () => {
    expect(parseModelFavorites('["p1/m1","p1/m2"]')).toEqual(["p1/m1", "p1/m2"]);
    expect(parseModelFavorites('["p1/m1","p1/m1"]')).toEqual(["p1/m1"]);
    expect(parseModelFavorites("[1,2]")).toEqual([]);
  });

  it("behandelt defekten Inhalt als leere Liste statt als Fehler", () => {
    expect(parseModelFavorites("{kaputt")).toEqual([]);
    expect(parseModelFavorites('{"p1/m1":true}')).toEqual([]);
    expect(parseModelFavorites(null)).toEqual([]);
    expect(parseModelFavorites(undefined)).toEqual([]);
  });

  it("schreibt und liest Favoriten am festen Schlüssel", () => {
    const storage = memoryStorage();
    writeModelFavorites(storage, ["p1/m2"]);
    expect(storage.values[MODEL_FAVORITES_STORAGE_KEY]).toBe('["p1/m2"]');
    expect(readModelFavorites(storage)).toEqual(["p1/m2"]);
  });

  it("überlebt einen blockierten Speicher", () => {
    const blocked: ModelFavoritesStorage = {
      getItem: () => {
        throw new Error("verboten");
      },
      setItem: () => {
        throw new Error("verboten");
      },
    };
    expect(readModelFavorites(blocked)).toEqual([]);
    expect(() => writeModelFavorites(blocked, ["p1/m1"])).not.toThrow();
    expect(readModelFavorites(null)).toEqual([]);
    expect(browserModelFavoritesStorage()).not.toBeNull();
  });

  it("schaltet einen Favorit um", () => {
    expect(toggleModelFavorite([], "p1/m1")).toEqual(["p1/m1"]);
    expect(toggleModelFavorite(["p1/m1"], "p1/m1")).toEqual([]);
    expect(modelFavoriteKey("p1", "m1")).toBe("p1/m1");
  });
});

describe("model-picker-data Anbietergruppen", () => {
  it("zeigt auch den letzten Anbieter, wenn die vorherigen voll sind", () => {
    // Der aktive Anbieter stand dadurch eine Zeit lang nicht zur Auswahl.
    const voll: HermesV2ModelCatalog = {
      providers: [
        {
          id: "gross",
          label: "Großer Anbieter",
          available: true,
          models: Array.from({ length: 200 }, (_, index) => model(`m${index}`)),
        },
        {
          id: "aktiv",
          label: "Aktiver Anbieter",
          available: true,
          models: [model("opencode-m3")],
        },
      ],
      current: { provider: "aktiv", model: "opencode-m3" },
    };
    const { groups } = groupModelEntries(voll, "", []);
    expect(groups.map((group) => group.provider.id)).toContain("aktiv");
    const aktiv = groups.find((group) => group.provider.id === "aktiv");
    expect(aktiv?.entries.map((entry) => entry.model.id)).toEqual(["opencode-m3"]);
  });

  it("begrenzt jeden Anbieter auf eine Vorschau und nennt die verdeckten Modelle", () => {
    const { groups } = groupModelEntries(catalog, "", []);
    const eins = groups.find((group) => group.provider.id === "p1");
    expect(eins?.hidden).toBeUndefined();
    const gross = groupModelEntries(
      {
        providers: [
          {
            id: "p1",
            label: "Anbieter Eins",
            available: true,
            models: Array.from({ length: 20 }, (_, index) => model(`m${index}`)),
          },
        ],
        current: null,
      },
      "",
      [],
    ).groups[0];
    expect(gross?.entries.length).toBe(MODEL_PROVIDER_PREVIEW);
    expect(gross?.hidden).toBe(20 - MODEL_PROVIDER_PREVIEW);
  });

  it("zeigt mit Suchtext alle Treffer eines Anbieters", () => {
    const treffer = groupModelEntries(
      {
        providers: [
          {
            id: "p1",
            label: "Anbieter Eins",
            available: true,
            models: Array.from({ length: 20 }, (_, index) => model(`glm-${index}`)),
          },
        ],
        current: null,
      },
      "glm",
      [],
    ).groups[0];
    expect(treffer?.entries.length).toBe(20);
    expect(treffer?.hidden).toBeUndefined();
  });

  it("stellt die Favoriten über alle Anbietergruppen", () => {
    const { groups } = groupModelEntries(catalog, "", ["p1/m2"]);
    expect(groups[0]?.provider.label).toBe("Favoriten");
    expect(groups[0]?.favorites).toBe(true);
    expect(groups[0]?.entries.map((entry) => entry.model.id)).toEqual(["m2"]);
    expect(groups.map((group) => group.provider.id)).toEqual([
      "favorites",
      "p1",
      "p2",
    ]);
  });

  it("zeigt Anbieter ohne Modelle sichtbar als benannt", () => {
    const { groups } = groupModelEntries(catalog, "");
    const empty = groups.find((group) => group.provider.id === "p2");
    expect(empty?.empty).toBe(true);
    expect(empty?.entries).toEqual([]);
  });

  it("zählt die Anbietergruppen ohne Favoriten unverändert", () => {
    const { groups, rendered, total } = groupModelEntries(catalog, "");
    expect(groups.map((group) => group.provider.id)).toEqual(["p1", "p2"]);
    expect(rendered).toBe(2);
    expect(total).toBe(2);
  });
});
