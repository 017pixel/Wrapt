// UItests für Logikmodule des Phase-6-Composers: Suche, Grenzen, Argumente.
import { describe, expect, it } from "vitest";
import type { HermesV2Command } from "@wrapt/contracts/hermes-v2";
import {
  filterSlashCommands,
  restHead,
  slashHint,
  splitSlashDraft,
  SLASH_LIMIT,
} from "./composer-slash";
import {
  canDisableReasoningFor,
  groupModelEntries,
  limitGroups,
  sameSelection,
  selectionTag,
  MODEL_PROVIDER_PREVIEW,
  MODEL_RENDER_LIMIT,
} from "./model-picker-data";
import type { HermesV2ModelCatalog } from "@wrapt/contracts/hermes-v2";

function command(overrides: Partial<HermesV2Command> = {}): HermesV2Command {
  return {
    key: "/example",
    label: "Beispiel",
    description: "Beschreibung",
    kind: "builtin",
    action: null,
    argumentHint: null,
    disabledReason: null,
    ...overrides,
  };
}

describe("composer-slash", () => {
  it("splitSlashDraft erkennt Slash und Argumentkopf", () => {
    expect(splitSlashDraft("/model gpt")).toEqual({
      startsSlash: true,
      rest: "model gpt",
    });
    expect(splitSlashDraft("Eigener Text")).toEqual({
      startsSlash: false,
      rest: "",
    });
    expect(restHead("model gpt eingrenzen")).toEqual({
      head: "model",
      argument: "gpt eingrenzen",
    });
    expect(restHead("model")).toEqual({ head: "model", argument: "" });
  });

  it("listet ohne Query begrenzt ab, native Befehle vor Skills und Classic", () => {
    const catalog = [
      command({
        key: "/steer",
        label: "Queue",
        description: "",
        kind: "unsupported",
        disabledReason: "Phase 7",
      }),
      command({
        key: "/research",
        label: "Forschung",
        description: "",
        kind: "skill",
        action: "skill",
      }),
      command({
        key: "/model",
        label: "Modell",
        description: "",
        action: "model",
      }),
    ];
    const entries = filterSlashCommands(catalog, "");
    // Katalogreihenfolge bleibt; kein sortierender Eingriff am dynamischen Bestand.
    expect(entries.map((entry) => entry.displayKey)).toEqual([
      "/steer",
      "/research",
      "/model",
    ]);
    expect(entries.length).toBeLessThanOrEqual(SLASH_LIMIT);
  });

  it("sucht exakt, präfixbasiert und über Aliase derselben Zeile", () => {
    const catalog = [
      command({ key: "/model", label: "Modell wählen", aliases: ["provider"] }),
      command({
        key: "/clear-history",
        label: "Verlauf leeren",
        description: "",
      }),
    ];
    const exact = filterSlashCommands(catalog, "model");
    expect(exact[0]?.displayKey).toBe("/model");
    const alias = filterSlashCommands(catalog, "provider");
    expect(alias[0]?.displayKey).toBe("/model");
    const subsequence = filterSlashCommands(catalog, "clhis");
    expect(subsequence[0]?.displayKey).toBe("/clear-history");
    expect(filterSlashCommands(catalog, "nichts").length).toBe(0);
  });

  it("begrenzt große Kataloge auf die Renderliste", () => {
    const catalog = Array.from({ length: 100 }, (_, index) =>
      command({ key: `/skill-${index}`, kind: "skill", action: "skill" }),
    );
    expect(filterSlashCommands(catalog, "").length).toBe(SLASH_LIMIT);
  });

  it("ableiten von Argumenthinweisen bleibt bei exportierten Metadaten", () => {
    expect(slashHint(command({ argumentHint: "aufgabe" }))).toBe("aufgabe");
    expect(
      slashHint(command({ subcommands: ["a", "b", "c", "d", "e", "f", "g"] })),
    ).toContain("e …");
    expect(slashHint(command())).toBeNull();
  });
});

describe("model-picker-data", () => {
  const model = (id: string) => ({
    id,
    label: id,
    reasoningEfforts: [],
    fast: true,
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
        available: false,
        models: [model("m3")],
      },
    ],
    current: { provider: "p1", model: "m1" },
  };

  it("gruppiert nach echter Anbietergruppe", () => {
    const { groups, rendered, total } = groupModelEntries(catalog, "");
    expect(groups.map((group) => group.provider.id)).toEqual(["p1", "p2"]);
    expect(rendered).toBe(3);
    expect(total).toBe(3);
  });

  it("sucht über Modell und Anbieter und begrenzt die Darstellung", () => {
    const only = groupModelEntries(catalog, "m1");
    expect(only.total).toBe(1);
    expect(
      limitGroups([
        {
          provider: { id: "x", label: "Anbieter", available: true },
          entries: Array.from({ length: MODEL_RENDER_LIMIT + 20 }, () => ({
            model: model("m"),
            providerId: "x",
            providerLabel: "Anbieter",
            available: true,
          })),
        },
      ]).rendered,
    ).toBe(MODEL_RENDER_LIMIT);
  });

  it("begrenzt jeden Anbieter auf eine Vorschau, ohne einen Anbieter zu verlieren", () => {
    const { groups, rendered, total } = groupModelEntries(
      {
        providers: [
          {
            id: "gross",
            label: "Großer Anbieter",
            available: true,
            models: Array.from({ length: 99 }, () => model("m")),
          },
          {
            id: "klein",
            label: "Kleiner Anbieter",
            available: true,
            models: [model("m")],
          },
        ],
        current: null,
      },
      "",
    );
    // Der aktive Anbieter stand dadurch eine Zeit lang nicht zur Auswahl.
    expect(groups.map((group) => group.provider.id)).toEqual(["gross", "klein"]);
    expect(groups[0]?.entries).toHaveLength(MODEL_PROVIDER_PREVIEW);
    expect(groups[0]?.hidden).toBe(99 - MODEL_PROVIDER_PREVIEW);
    expect(rendered).toBe(MODEL_PROVIDER_PREVIEW + 1);
    // Die Gesamtzahl nennt alle passenden Modelle, nicht nur die sichtbaren.
    expect(total).toBe(100);
  });

  it("markiert unavailable-Anbieter für den Dialog zum Sperren", () => {
    const { groups } = groupModelEntries(catalog, "");
    expect(groups[1]?.provider.available).toBe(false);
  });

  it("vergleicht Auswahl grob und detailliert", () => {
    expect(
      sameSelection(
        { provider: "p1", model: "m1" },
        { provider: "p1", model: "m1" },
      ),
    ).toBe(true);
    expect(
      sameSelection(
        { provider: "p1", model: "m1" },
        { provider: "p1", model: "m2" },
      ),
    ).toBe(false);
    expect(selectionTag({ provider: "p1", model: "m1" })).toBe("p1:m1");
    expect(canDisableReasoningFor(null, null)).toBeNull();
    expect(
      canDisableReasoningFor(
        {
          ...catalog,
          providers: [
            {
              ...catalog.providers[0]!,
              models: [
                ...catalog.providers[0]!.models.map((model) => ({
                  ...model,
                  canDisableReasoning: true,
                })),
              ],
            },
            ...catalog.providers.slice(1),
          ],
        },
        { provider: "p1", model: "m1" },
      ),
    ).toBe(true);
  });
});
