import { describe, expect, it } from "vitest";
import {
  buildWorkspaceSwitchHref,
  createWorkspaceEntry,
  decodeWorkspaceFragment,
  encodeWorkspaceFragment,
  ensureSelfWorkspace,
  mergeWorkspaceEntries,
  normalizeWorkspaceUrl,
  parseWorkspaceRegistry,
  serializeWorkspaceRegistry,
  type WorkspaceEntry,
} from "./workspaceModel";

const date = "2026-09-24T10:00:00.000Z";

function entry(id: string, name: string, url: string, lastUsedAt: string | null = null): WorkspaceEntry {
  return { id, name, url, addedAt: date, lastUsedAt };
}

describe("Workspace-Modell", () => {
  it("normalisiert eine URL auf ihre Origin und entfernt Pfad, Query und Slash", () => {
    expect(normalizeWorkspaceUrl(" HTTPS://MacBook.example.ts.net:8443/wrapt/?tab=1#top ")).toBe("https://macbook.example.ts.net:8443");
    expect(normalizeWorkspaceUrl("http://127.0.0.1:3010/anything/" )).toBe("http://127.0.0.1:3010");
  });

  it("ignoriert unsichere und ungültige URLs", () => {
    expect(normalizeWorkspaceUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWorkspaceUrl("https://user:secret@example.ts.net")).toBeNull();
    expect(normalizeWorkspaceUrl("kein-url")).toBeNull();
  });

  it("übergibt Registry-Daten und verwirft kaputte Einträge", () => {
    const original = [entry("server-a", "Server A", "https://a.example.ts.net", "2026-09-24T11:00:00.000Z")];
    const fragment = encodeWorkspaceFragment(original);
    expect(fragment).toContain("wraptWorkspaces=");
    expect(fragment).toContain("addedAt");
    expect(fragment).toContain("lastUsedAt");
    expect(decodeWorkspaceFragment(fragment)).toEqual([
      original[0],
    ]);
    expect(decodeWorkspaceFragment("#wraptWorkspaces=%7Bkaputt")).toEqual([]);
  });

  it("bereinigt unbekannte Felder und Duplikate und erhält Zeitstempel", () => {
    const fragment = `#wraptWorkspaces=${encodeURIComponent(JSON.stringify([
      { id: "server-a", name: "Alter Name", url: "https://a.example.ts.net", addedAt: "2026-09-20T10:00:00.000Z", lastUsedAt: null, ignored: "secret" },
      { id: "other-id", name: "Neuer Name", url: "https://a.example.ts.net", addedAt: date, lastUsedAt: "2026-09-24T11:00:00.000Z" },
      { id: "shared-id", name: "Server B", url: "https://b.example.ts.net", addedAt: date },
      { id: "shared-id", name: "Server C", url: "https://c.example.ts.net", addedAt: date },
    ]))}`;
    const decoded = decodeWorkspaceFragment(fragment);
    expect(decoded).toHaveLength(3);
    expect(decoded[0]).toMatchObject({
      id: "server-a",
      name: "Neuer Name",
      addedAt: "2026-09-20T10:00:00.000Z",
      lastUsedAt: "2026-09-24T11:00:00.000Z",
    });
    expect(decoded[0]).not.toHaveProperty("ignored");
    expect(decoded[1]?.id).toBe("shared-id");
    expect(decoded[2]?.id).not.toBe("shared-id");
    expect(new Set(decoded.map((item) => item.id)).size).toBe(decoded.length);
  });

  it("ignoriert Workspace-Fragmente über 100 kB ohne JSON-Verarbeitung", () => {
    expect(decodeWorkspaceFragment(`#wraptWorkspaces=${"x".repeat(100_000)}`)).toEqual([]);
  });

  it("erhält verschiedene URLs mit derselben ID und dedupliziert gleiche URLs mit abweichenden IDs", () => {
    const parsed = parseWorkspaceRegistry(serializeWorkspaceRegistry([
      entry("same-id", "Server A", "https://a.example.ts.net"),
      entry("same-id", "Server B", "https://b.example.ts.net"),
      entry("other-id", "Doppelter Server A", "https://a.example.ts.net"),
    ]));
    expect(parsed).toHaveLength(2);
    expect(parsed?.map((item) => item.url)).toEqual(["https://a.example.ts.net", "https://b.example.ts.net"]);
    expect(parsed?.[0]?.id).toBe("same-id");
    expect(parsed?.[1]?.id).not.toBe("same-id");
    expect(new Set(parsed?.map((item) => item.id)).size).toBe(2);
  });

  it("merged den eingehenden Snapshot, erhält ID-Konflikte und schützt Self", () => {
    const self = entry("self-id", "Mein Server", "https://self.example.ts.net");
    const existing = [
      self,
      entry("server-a", "Alter Name", "https://a.example.ts.net"),
      entry("server-b", "Server B", "https://b.example.ts.net"),
    ];
    const incoming = [
      entry("remote-self", "Falscher Self-Name", self.url),
      entry("other-id", "Neuer Name", "https://a.example.ts.net", "2026-09-24T11:00:00.000Z"),
      entry("server-b", "Server B umgezogen", "https://elsewhere.example.ts.net"),
      entry("server-c", "Server C", "https://c.example.ts.net"),
    ];

    const merged = mergeWorkspaceEntries(existing, incoming, self);
    expect(merged.find((item) => item.url === self.url)).toEqual(self);
    expect(merged.find((item) => item.url === "https://a.example.ts.net")).toMatchObject({
      id: "server-a",
      name: "Neuer Name",
      addedAt: date,
      lastUsedAt: "2026-09-24T11:00:00.000Z",
    });
    expect(merged.some((item) => item.url === "https://b.example.ts.net")).toBe(false);
    expect(merged.some((item) => item.id === "server-b" && item.url === "https://elsewhere.example.ts.net")).toBe(true);
    expect(merged.some((item) => item.url === "https://c.example.ts.net")).toBe(true);
    expect(new Set(merged.map((item) => item.id)).size).toBe(merged.length);
    expect(new Set(merged.map((item) => item.url)).size).toBe(merged.length);
  });

  it("aktualisiert den Self-Namen aus Health, ohne ID und Hinzugefügt-Datum zu ändern", () => {
    const saved = entry("stable-self", "Alter Name", "https://self.example.ts.net");
    const first = ensureSelfWorkspace([saved], saved.url, "Neuer Name", new Date("2026-09-24T12:00:00.000Z"));
    expect(first[0]).toMatchObject({ id: "stable-self", name: "Neuer Name", addedAt: date, lastUsedAt: null });
  });

  it("übernimmt die Ziel-Self-ID und vergibt bei einer Kollision eine neue ID an den Fremdeintrag", () => {
    const initialized = ensureSelfWorkspace([], "https://self.example.ts.net", "Self", new Date(date), undefined, "shared-self");
    expect(initialized[0]?.id).toBe("shared-self");
    const conflict = ensureSelfWorkspace([entry("shared-self", "Other", "https://other.example.ts.net")], "https://self.example.ts.net", "Self", new Date(date), () => "generated-self", "shared-self");
    expect(conflict.find((item) => item.url === "https://self.example.ts.net")?.id).toBe("shared-self");
    expect(conflict.find((item) => item.url === "https://other.example.ts.net")?.id).not.toBe("shared-self");
    expect(conflict.some((item) => item.url === "https://other.example.ts.net")).toBe(true);
  });

  it("führt gleichnamige URLs zusammen und bewahrt addedAt sowie den letzten Nutzungszeitpunkt", () => {
    const self = entry("self-id", "Self", "https://self.example.ts.net");
    const current = entry("stable-id", "Alter Name", "https://server.example.ts.net", "2026-09-24T12:00:00.000Z");
    current.addedAt = "2026-09-20T10:00:00.000Z";
    const incoming = entry("new-id", "Neuer Name", current.url, "2026-09-24T13:00:00.000Z");
    incoming.addedAt = "2026-09-22T10:00:00.000Z";
    const merged = mergeWorkspaceEntries([self, current], [incoming], self);
    expect(merged[1]).toMatchObject({
      id: "stable-id",
      name: "Neuer Name",
      addedAt: "2026-09-20T10:00:00.000Z",
      lastUsedAt: "2026-09-24T13:00:00.000Z",
    });
  });

  it("ignoriert beschädigte Registry-Zeilen und hält das persistierte Format versioniert", () => {
    const serialized = serializeWorkspaceRegistry([
      entry("good", "Gut", "https://good.example.ts.net"),
      { ...entry("broken", "Kaputt", "ftp://bad.example"), url: "ftp://bad.example" },
    ]);
    expect(parseWorkspaceRegistry(serialized)).toEqual([entry("good", "Gut", "https://good.example.ts.net")]);
    expect(parseWorkspaceRegistry("{" )).toBeNull();
  });

  it("lehnt einen unvollständigen neuen Eintrag ab", () => {
    expect(createWorkspaceEntry("id", "  ", "https://wrapt.example.ts.net")).toBeNull();
    expect(createWorkspaceEntry("bad id", "Wrapt", "https://wrapt.example.ts.net")).toBeNull();
  });

  it("behält die aktuelle Seite beim Workspace-Wechsel", () => {
    const entries = [entry("self-id", "Main", "https://main.example.ts.net"), entry("second-id", "Zweitserver", "https://second.example.ts.net")];
    const href = buildWorkspaceSwitchHref("https://second.example.ts.net", entries, { pathname: "/wrapt/notizen", search: "", hash: "" });
    expect(href).not.toBeNull();
    expect(href?.startsWith("https://second.example.ts.net/wrapt/notizen")).toBe(true);
    expect(href).toContain("wraptWorkspaces=");
    expect(decodeWorkspaceFragment(new URL(href ?? "").hash)).toHaveLength(2);
  });

  it("behält Query und Anker beim Wechsel und verdoppelt das Workspace-Fragment nicht", () => {
    const entries = [entry("second-id", "Zweitserver", "https://second.example.ts.net")];
    const href = buildWorkspaceSwitchHref(
      "https://second.example.ts.net",
      entries,
      { pathname: "/wrapt/hermes-agent", search: "?path=%2Fchat", hash: "#knoten&wraptWorkspaces=alt" },
    );
    expect(href?.startsWith("https://second.example.ts.net/wrapt/hermes-agent?path=%2Fchat#knoten&wraptWorkspaces=")).toBe(true);
    expect((href?.match(/wraptWorkspaces=/g) ?? []).length).toBe(1);
  });

  it("fällt für Dashboard und unsichere Pfade auf den Root zurück", () => {
    const entries = [entry("second-id", "Zweitserver", "https://second.example.ts.net")];
    expect(buildWorkspaceSwitchHref("https://second.example.ts.net", entries, { pathname: "/wrapt/", search: "", hash: "" }))
      ?.toBe(`https://second.example.ts.net/wrapt/${encodeWorkspaceFragment(entries)}`);
    expect(buildWorkspaceSwitchHref("https://second.example.ts.net", entries, { pathname: "/wrapt", search: "", hash: "" }))
      ?.toBe(`https://second.example.ts.net/wrapt/${encodeWorkspaceFragment(entries)}`);
    expect(buildWorkspaceSwitchHref("https://second.example.ts.net", entries, { pathname: "/wrapt/../etc", search: "", hash: "" }))
      ?.toBe(`https://second.example.ts.net/wrapt/${encodeWorkspaceFragment(entries)}`);
    expect(buildWorkspaceSwitchHref("https://second.example.ts.net", entries, { pathname: "javascript:alert(1)", search: "", hash: "" }))
      ?.toBe(`https://second.example.ts.net/wrapt/${encodeWorkspaceFragment(entries)}`);
    expect(buildWorkspaceSwitchHref("kein-url", entries, { pathname: "/wrapt/notizen", search: "", hash: "" })).toBeNull();
  });
});
