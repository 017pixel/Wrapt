import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UI_SETTINGS_LIMITS } from "@wrapt/contracts";
import { UiSettingsDatabase } from "./database.js";

const directories: string[] = [];
const databases: UiSettingsDatabase[] = [];

function createDatabase(): UiSettingsDatabase {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-ui-settings-"));
  directories.push(directory);
  const database = new UiSettingsDatabase(join(directory, "wrapt.sqlite"));
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("UiSettingsDatabase", () => {
  it("startet mit einem leeren Dokument", () => {
    expect(createDatabase().get("user@example.com")).toMatchObject({
      version: 1,
      revision: 0,
      entries: {},
    });
  });

  it("speichert Schlüssel mit eigener Revision und überschreibt andere nicht", () => {
    const database = createDatabase();
    const first = database.save("user@example.com", {
      clientId: "client-a",
      changes: [{ key: "appPreferences", value: { state: { defaultPage: "usage" }, version: 2 } }],
    });
    expect(first.revision).toBe(1);
    expect(first.entries.appPreferences?.revision).toBe(1);

    const second = database.save("user@example.com", {
      clientId: "client-b",
      changes: [{ key: "overlayTransparency", value: 140 }],
    });
    expect(second.revision).toBe(2);
    expect(second.entries.appPreferences).toEqual(first.entries.appPreferences);
    expect(second.entries.overlayTransparency).toMatchObject({ value: 140, revision: 2 });
  });

  it("hält Benutzer auseinander und überlebt einen Neustart", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-ui-settings-"));
    directories.push(directory);
    const path = join(directory, "wrapt.sqlite");
    const database = new UiSettingsDatabase(path);
    database.save("a@example.com", { clientId: "a", changes: [{ key: "layout", value: { state: { pages: [] }, version: 4 } }] });
    database.save("b@example.com", { clientId: "b", changes: [{ key: "layout", value: { state: { pages: [1] }, version: 4 } }] });
    database.close();

    const reopened = new UiSettingsDatabase(path);
    databases.push(reopened);
    expect(reopened.get("a@example.com").entries.layout?.value).toEqual({ state: { pages: [] }, version: 4 });
    expect(reopened.get("b@example.com").entries.layout?.value).toEqual({ state: { pages: [1] }, version: 4 });
  });

  it("lehnt zu große Einzelwerte ab", () => {
    const database = createDatabase();
    expect(() => database.save("user@example.com", {
      clientId: "client",
      changes: [{ key: "layout", value: "x".repeat(UI_SETTINGS_LIMITS.maxValueBytes + 1) }],
    })).toThrowError(/zu groß/);
  });

  it("übernimmt bei doppelten Schlüsseln im selben Aufruf den letzten Wert", () => {
    const database = createDatabase();
    const document = database.save("user@example.com", {
      clientId: "client",
      changes: [
        { key: "overlayTransparency", value: 10 },
        { key: "overlayTransparency", value: 220 },
      ],
    });
    expect(document.entries.overlayTransparency?.value).toBe(220);
  });
});
