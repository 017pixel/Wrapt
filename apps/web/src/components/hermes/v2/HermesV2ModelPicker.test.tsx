// UItests Modelpicker: echte Katalogdaten, gleiche Auswahlbestätigung, Sessionwechsel.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { ChatComposerView } from "./chat-composer-types";
import { HermesV2ModelPicker } from "./HermesV2ModelPicker";
import { composerFixture } from "./request-card-fixtures";
import { MODEL_FAVORITES_STORAGE_KEY } from "./model-picker-data";

const catalog = {
  providers: [
    {
      id: "p1",
      label: "Anbieter Eins",
      available: true,
      models: [
        {
          id: "m1",
          label: "Modell Eins",
          reasoningEfforts: [],
          fast: false,
          priceInput: null,
          priceOutput: null,
        },
        {
          id: "m2",
          label: "Modell Zwei",
          reasoningEfforts: [],
          fast: true,
          priceInput: null,
          priceOutput: null,
        },
      ],
    },
    {
      id: "p2",
      label: "Anbieter Zwei",
      available: false,
      models: [
        {
          id: "m3",
          label: "Modell Drei",
          reasoningEfforts: [],
          fast: false,
          priceInput: null,
          priceOutput: null,
        },
      ],
    },
    {
      id: "p3",
      label: "Anbieter Drei",
      available: true,
      models: [],
    },
  ],
  current: { provider: "p1", model: "m1" },
};

function selectedComposer(
  overrides: Partial<ChatComposerView> = {},
): ChatComposerView {
  return composerFixture({
    model: {
      requested: { provider: "p1", model: "m1" },
      status: "idle",
      confirmation: null,
    },
    ...overrides,
  });
}

function renderPicker(
  overrides: {
    composer?: ChatComposerView;
    observedSelection?: { provider: string; model: string } | null;
    onSelect?: (
      selection: { provider: string; model: string },
      confirmed?: boolean,
    ) => void | Promise<void>;
    onCancel?: () => void;
  } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn().mockResolvedValue(undefined);
  const props = {
    open: true,
    onClose: vi.fn(),
    catalog,
    composer: overrides.composer ?? selectedComposer(),
    sessionId: "s1",
    observedSelection: overrides.observedSelection ?? {
      provider: "p1",
      model: "m1",
    },
    onSelect,
    onCancel: overrides.onCancel ?? vi.fn(),
  };
  const view = render(
    <MemoryRouter>
      <HermesV2ModelPicker {...props} />
    </MemoryRouter>,
  );
  const rerenderPicker = (next: typeof props, open: boolean) =>
    view.rerender(
      <MemoryRouter>
        <HermesV2ModelPicker {...next} open={open} />
      </MemoryRouter>,
    );
  return { props, rerenderPicker };
}

describe("HermesV2ModelPicker", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("öffnet mit Titel, Suchfeld und echten Anbietergruppen", () => {
    renderPicker();
    expect(
      screen.getByRole("dialog", { name: "Modell und Anbieter" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("searchbox", { name: "Modelle suchen" }),
    ).toBeTruthy();
    expect(screen.getByText("Anbieter Eins")).toBeTruthy();
    const row = screen.getByRole("button", {
      name: "Modell Zwei bei Anbieter Eins wählen",
    });
    expect(row.getAttribute("data-provider-id")).toBe("p1");
    expect(row.getAttribute("data-model-id")).toBe("m2");
  });

  it("startet beim erneuten Öffnen ohne die alte Suche", () => {
    const { props, rerenderPicker } = renderPicker();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Modelle suchen" }),
      { target: { value: "zwei" } },
    );
    expect(
      screen.queryByRole("button", {
        name: "Modell Eins bei Anbieter Eins wählen",
      }),
    ).toBeNull();
    rerenderPicker(props, false);
    rerenderPicker(props, true);
    expect(
      screen.getByRole("button", {
        name: "Modell Eins bei Anbieter Eins wählen",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("searchbox", { name: "Modelle suchen" }),
    ).toHaveProperty("value", "");
  });

  it("sucht nach Modell und Anbieter und rendert begrenzt", () => {
    renderPicker();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Modelle suchen" }),
      { target: { value: "zwei" } },
    );
    expect(
      screen.queryByRole("button", {
        name: "Modell Eins bei Anbieter Eins wählen",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Modell Zwei bei Anbieter Eins wählen",
      }),
    ).toBeTruthy();
  });

  it("sperrt nicht verhandelte Anbieter ehrlich", () => {
    renderPicker();
    const row = screen.getByRole("button", {
      name: "Modell Drei bei Anbieter Zwei wählen",
    });
    expect(row.hasAttribute("disabled")).toBe(true);
  });

  it("nennt Anbieter ohne gemeldete Modelle, statt sie verschwinden zu lassen", () => {
    renderPicker();
    expect(screen.getByText("Anbieter Drei")).toBeTruthy();
    expect(
      screen.getByText("Für diesen Anbieter wurden keine Modelle gemeldet."),
    ).toBeTruthy();
  });

  it("markiert Modelle als Favorit und legt sie in eine eigene Gruppe oben ab", () => {
    renderPicker();
    const stars = screen.getAllByRole("button", { name: "Favorit" });
    fireEvent.click(stars[1]!);
    // Der Stern erscheint in der Anbietergruppe und in der Favoritensektion.
    expect(
      screen.getAllByRole("button", { name: "Favorit entfernen" }).length,
    ).toBe(2);
    const groups = Array.from(
      document.querySelectorAll(".hermesv2-model-provider"),
    ).map((group) => group.getAttribute("data-provider-id"));
    expect(groups[0]).toBe("favorites");
    expect(screen.getByText("Favoriten")).toBeTruthy();
    // Die Favoritensektion nennt den echten Anbieter des Modells.
    const imFavoriten = document.querySelector(
      '.hermesv2-model-provider[data-provider-id="favorites"]',
    );
    expect(
      imFavoriten?.querySelector('[data-model-id="m2"]'),
    ).toBeTruthy();
    expect(
      window.localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY),
    ).toBe(JSON.stringify(["p1/m2"]));
  });

  it("wählt ein Favoritenmodell beim echten Anbieter", () => {
    // Aus der Favoritensektion heraus muss der Originalanbieter gesendet
    // werden; die Gruppennamen der Sektion sind kein Anbieter.
    window.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(["p1/m1"]),
    );
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    const imFavoriten = document.querySelector(
      '.hermesv2-model-provider[data-provider-id="favorites"]',
    );
    const knopf = imFavoriten?.querySelector(
      '[data-model-id="m1"]',
    ) as HTMLElement;
    expect(knopf).toBeTruthy();
    fireEvent.click(knopf);
    expect(onSelect).toHaveBeenCalledWith({ provider: "p1", model: "m1" });
  });

  it("entfernt ein Favoritenmodell mit dem Schlüssel des Originalanbieters", () => {
    window.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(["p1/m1"]),
    );
    renderPicker();
    // Der Stern in der Favoritensektion muss den echten Schlüssel treffen.
    const imFavoriten = document.querySelector(
      '.hermesv2-model-provider[data-provider-id="favorites"]',
    );
    const stern = imFavoriten?.querySelector(
      ".hermesv2-model-favorite",
    ) as HTMLElement;
    expect(stern).toBeTruthy();
    fireEvent.click(stern);
    expect(
      window.localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY),
    ).toBe(JSON.stringify([]));
  });

  it("übernimmt gespeicherte Favoriten beim Öffnen", () => {
    window.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(["p1/m1"]),
    );
    renderPicker();
    expect(screen.getByText("Favoriten")).toBeTruthy();
    const imFavoriten = document.querySelector(
      '.hermesv2-model-provider[data-provider-id="favorites"]',
    );
    expect(imFavoriten?.querySelector('[data-model-id="m1"]')).toBeTruthy();
  });

  it("übersteht einen defekten Favoritenspeicher ohne Fehler", () => {
    window.localStorage.setItem(MODEL_FAVORITES_STORAGE_KEY, "{kaputt");
    renderPicker();
    expect(screen.queryByText("Favoriten")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Modell Eins bei Anbieter Eins wählen",
      }),
    ).toBeTruthy();
  });

  it("lässt nur das Schließen oben rechts zu", () => {
    renderPicker();
    const closeButtons = screen.getAllByRole("button", {
      name: "Dialog schließen",
    });
    expect(closeButtons.length).toBe(1);
  });

  it("wählt unbestätigt und bleibt für die Corebestätigung offen", () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    renderPicker({ onSelect });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Modell Zwei bei Anbieter Eins wählen",
      }),
    );
    expect(onSelect.mock.calls).toEqual([[{ provider: "p1", model: "m2" }]]);
    // screen bewusst offen: Bestätigung folgt über das echte Viewmodel.
    expect(
      screen.getByRole("dialog", { name: "Modell und Anbieter" }),
    ).toBeTruthy();
  });

  it("bestätigt die Corekostenbestätigung nur für dieselbe Auswahl mit confirmed=true", () => {
    const confirmation = {
      selection: { provider: "p1", model: "m2" } as const,
      message: "Dieses Modell kostet mehr.",
    };
    const composer = selectedComposer({
      model: {
        requested: { provider: "p1", model: "m2" },
        status: "confirmation",
        confirmation: {
          selection: confirmation.selection,
          message: confirmation.message,
        } as ChatComposerView["model"]["confirmation"],
      },
    });
    const onSelect = vi.fn().mockResolvedValue(undefined);
    renderPicker({
      composer,
      onSelect,
      observedSelection: { provider: "p1", model: "m1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kosten bestätigen" }));
    expect(onSelect).toHaveBeenCalledWith(
      { provider: "p1", model: "m2" },
      true,
    );
  });

  it("spern eine fremde Bestätigung nach lokalem Wechsel und verwerfen sie", () => {
    const composer = selectedComposer({
      model: {
        requested: { provider: "p1", model: "m2" },
        status: "confirmation",
        confirmation: {
          selection: { provider: "p1", model: "m1" },
          message: "Kosten!",
        } as ChatComposerView["model"]["confirmation"],
      },
    });
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    renderPicker({ composer, onSelect, onCancel });
    const confirm = screen.getByRole("button", { name: "Kosten bestätigen" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(confirm.getAttribute("title")).toContain("früheren Auswahl");
    fireEvent.click(screen.getByRole("button", { name: "Auswahl verwerfen" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("zeigt deferred als Vorbemerkung und berührt kein laufendes Modell", () => {
    renderPicker({
      composer: selectedComposer({
        model: {
          requested: { provider: "p1", model: "m2" },
          status: "deferred",
          confirmation: null,
        },
      }),
    });
    expect(
      document.querySelector(".hermesv2-model-status")?.textContent,
    ).toContain("Vorgemerkt");
  });

  it("nutzt die beobachtete Sessionauswahl statt dem Katalogcache", () => {
    renderPicker({ observedSelection: { provider: "p1", model: "m2" } });
    const current = document.querySelector(".hermesv2-model-current");
    expect(current?.textContent).toContain("Aktuell: p1:m2");
  });
});
